import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { normalizeOpenCodeActiveTurnHistory, normalizeOpenCodeEvent, normalizeOpenCodeHistory, createOpenCodeEventState } from "./opencode-events.mjs";
import { formatModelSelection, parseModelSelection } from "./opencode-http-client.mjs";
import { OPENCODE_CAPABILITIES, OPENCODE_PROMPT_PROFILE, OPENCODE_RUNTIME_DESCRIPTOR, OPENCODE_UPSTREAM } from "./opencode-manifest.mjs";
import { formatAuthorizedProjectInstructions, loadAuthorizedProjectInstructions } from "./opencode-project-instructions.mjs";
import { createOpenCodeSessionPermissions, openCodePolicyKey } from "./opencode-security-policy.mjs";

export class OpenCodeSidecarAdapter {
  constructor({
    readiness,
    workspaceRoot,
    host,
    onEvent = () => {},
    onExit = () => {},
    projectInstructionLoader = loadAuthorizedProjectInstructions,
  }) {
    this.readiness = { ...readiness, workspaceRoot };
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.host = host;
    this.onEvent = onEvent;
    this.onExit = onExit;
    this.client = null;
    this.sessionId = null;
    this.selectedModel = null;
    this.selectedMode = null;
    this.eventState = createOpenCodeEventState();
    this.projectInstructionLoader = projectInstructionLoader;
    this.appliedPolicyKey = null;
    this.commandNames = new Set();
    this.commandRequest = null;
    this.reconcilePromise = null;
    this.unsubscribeEvent = host.subscribe((envelope) => this.#handleEnvelope(envelope));
    this.unsubscribeExit = host.onExit((info) => {
      if (this.client) this.onExit(info);
    });
    this.unsubscribeReconnect = host.onReconnect?.(() => this.#reconcileAfterReconnect()) ?? null;
    this.disposed = false;
  }

  async connect() {
    if (this.disposed) throw new Error("OpenCode adapter is closed.");
    if (!this.client) this.client = await this.host.acquire(this.readiness);
    return this.client;
  }

  async inspect() {
    const client = await this.connect();
    const [providerResult, agents, commands] = await Promise.all([
      client.providerCatalog(this.workspaceRoot),
      client.agents(this.workspaceRoot).catch(() => []),
      client.commands(this.workspaceRoot).catch(() => []),
    ]);
    const providerCatalog = normalizeProviderCatalog(providerResult);
    const models = providerCatalog.models;
    const modes = normalizeModes(agents);
    const authenticated = providerCatalog.providers.length > 0 && models.length > 0;
    const setupError = providerCatalog.connectedProviderCount > 0
      ? "Connected model providers do not expose a text-and-tools Agent model."
      : "No model provider is connected to PuppyOne Agent.";
    const normalizedCommands = normalizeCommands(commands);
    this.commandNames = new Set(normalizedCommands.map((command) => command.name));
    return {
      account: {
        account: authenticated ? { type: "opencode", email: null, planType: null } : null,
        requiresOpenaiAuth: false,
        requiresRuntimeSetup: !authenticated,
        ...(authenticated ? {} : { error: setupError }),
      },
      providers: providerCatalog.providers,
      models,
      modes,
      commands: normalizedCommands,
      capabilities: { ...OPENCODE_CAPABILITIES },
      warnings: this.readiness.compatibility === "pinned"
        ? []
        : [`Using compatible external OpenCode ${this.readiness.version ?? "unknown"}; packaged builds pin ${OPENCODE_UPSTREAM.sourceVersion}.`],
      runtime: {
        ...OPENCODE_RUNTIME_DESCRIPTOR,
        version: this.readiness.version ?? null,
        source: this.readiness.source ?? "external",
        compatibility: this.readiness.compatibility ?? "compatible-external",
      },
    };
  }

  async createSession({ model, mode } = {}) {
    const client = await this.connect();
    const selectedModel = parseModelSelection(model);
    const pinnedRuntime = this.readiness.compatibility === "pinned";
    const created = await client.createSession({
      directory: this.workspaceRoot,
      title: "New agent session",
      model: selectedModel,
      agent: normalizeOptionalString(mode),
      permission: createOpenCodeSessionPermissions(mode),
      metadata: {
        "puppyone.runtime": "opencode",
        "puppyone.runtimeVersion": this.readiness.version ?? OPENCODE_UPSTREAM.sourceVersion,
        "puppyone.runtimeCommit": pinnedRuntime ? OPENCODE_UPSTREAM.releaseCommit : "external-unverified",
        "puppyone.promptProfile": pinnedRuntime ? OPENCODE_PROMPT_PROFILE.id : "external-unverified",
        "puppyone.promptCommit": pinnedRuntime ? OPENCODE_PROMPT_PROFILE.commit : "external-unverified",
        "puppyone.promptManifestSha256": pinnedRuntime ? OPENCODE_PROMPT_PROFILE.manifestSha256 : "external-unverified",
      },
    });
    this.#attachSession(created?.id, { model, mode });
    this.appliedPolicyKey = openCodePolicyKey(mode);
    return normalizeSession(created, { model, mode });
  }

  async resumeSession({ threadId, model, mode } = {}) {
    const client = await this.connect();
    const [info, statuses] = await Promise.all([
      client.getSession({ directory: this.workspaceRoot, sessionID: threadId }),
      client.sessionStatus(this.workspaceRoot).catch(() => ({})),
    ]);
    this.#attachSession(threadId, { model, mode });
    await this.#applySecurityPolicy(client, mode, { force: true });
    await this.#rejectOrphanedBlockingRequests(client, threadId);
    const status = statuses && typeof statuses === "object" ? statuses[threadId] : null;
    if (status && status.type !== "idle") {
      this.eventState.activeTurnId = `opencode:resumed:${threadId}`;
      this.onEvent(agentLifecycleEvent("turn.started", threadId, this.eventState.activeTurnId, {
        status: "running",
        resumedInFlight: true,
      }));
    }
    return normalizeSession(info, { model, mode });
  }

  async readHistory() {
    if (!this.sessionId) return [];
    const client = await this.connect();
    const messages = await client.messages({ directory: this.workspaceRoot, sessionID: this.sessionId });
    return normalizeOpenCodeHistory(messages);
  }

  async startTurn({ prompt, model, mode, attachments = [], contextReferences = [] }) {
    if (!this.sessionId) throw new Error("OpenCode session has not started.");
    if (this.eventState.activeTurnId) throw new Error("An OpenCode turn is already running.");
    const client = await this.connect();
    const effectiveMode = mode || this.selectedMode;
    await this.#applySecurityPolicy(client, effectiveMode);
    const projectInstructions = await this.projectInstructionLoader(this.workspaceRoot);
    const turnId = `opencode:${randomUUID()}`;
    this.eventState.activeTurnId = turnId;
    this.eventState.interruptRequested = false;
    this.selectedModel = model || this.selectedModel;
    this.selectedMode = effectiveMode;
    try {
      const selectedModel = parseModelSelection(this.selectedModel);
      const selectedAgent = normalizeOptionalString(this.selectedMode);
      const slashCommand = parseSlashCommand(prompt, this.commandNames);
      if (slashCommand) {
        const request = client.command({
          directory: this.workspaceRoot,
          sessionID: this.sessionId,
          command: slashCommand.name,
          arguments: slashCommand.arguments,
          model: selectedModel,
          agent: selectedAgent,
          variant: selectedModel?.variant,
          parts: createCommandParts(attachments, contextReferences, projectInstructions),
        }, { timeoutMs: 6 * 60 * 60 * 1_000 });
        this.commandRequest = request;
        void request.catch((error) => {
          if (this.disposed || this.eventState.activeTurnId !== turnId || this.eventState.interruptRequested) return;
          this.eventState.activeTurnId = null;
          this.onEvent(agentLifecycleEvent("turn.failed", this.sessionId, turnId, {
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          }));
        }).finally(() => {
          if (this.commandRequest === request) this.commandRequest = null;
        });
      } else {
        await client.promptAsync({
          directory: this.workspaceRoot,
          sessionID: this.sessionId,
          model: selectedModel,
          agent: selectedAgent,
          system: formatAuthorizedProjectInstructions(projectInstructions),
          parts: createPromptParts(prompt, attachments, contextReferences),
        });
      }
      return { turnId };
    } catch (error) {
      this.eventState.activeTurnId = null;
      throw error;
    }
  }

  async interruptTurn({ turnId }) {
    if (!this.sessionId || this.eventState.activeTurnId !== turnId) {
      throw new Error("That OpenCode turn is no longer running.");
    }
    const client = await this.connect();
    await client.abortSession({ directory: this.workspaceRoot, sessionID: this.sessionId });
    this.eventState.interruptRequested = true;
  }

  async resolveApproval({ requestId, decision }) {
    const client = await this.connect();
    await client.replyPermission({
      directory: this.workspaceRoot,
      requestID: requestId,
      reply: decision === "accept" ? "once" : decision === "acceptForSession" ? "always" : "reject",
    });
  }

  async resolveQuestion({ requestId, answers, rejected = false }) {
    const client = await this.connect();
    if (rejected) {
      await client.rejectQuestion({ directory: this.workspaceRoot, requestID: requestId });
      return;
    }
    await client.replyQuestion({ directory: this.workspaceRoot, requestID: requestId, answers });
  }

  async forkSession() {
    if (!this.sessionId) throw new Error("OpenCode session has not started.");
    const client = await this.connect();
    const forked = await client.forkSession({ directory: this.workspaceRoot, sessionID: this.sessionId });
    return normalizeSession(forked, { model: this.selectedModel, mode: this.selectedMode });
  }

  async listNativeSessions() {
    const client = await this.connect();
    const sessions = await client.listSessions(this.workspaceRoot);
    return Array.isArray(sessions) ? sessions.map((session) => normalizeSession(session)) : [];
  }

  async archiveNativeSession({ threadId }) {
    const client = await this.connect();
    await client.updateSession({
      directory: this.workspaceRoot,
      sessionID: threadId,
      archivedAt: Date.now(),
    });
  }

  async deleteNativeSession({ threadId }) {
    const client = await this.connect();
    await client.deleteSession({ directory: this.workspaceRoot, sessionID: threadId });
  }

  async compactSession() {
    if (!this.sessionId) throw new Error("OpenCode session has not started.");
    const model = parseModelSelection(this.selectedModel);
    if (!model) throw new Error("Select an OpenCode model before compacting the session.");
    const client = await this.connect();
    return client.summarize({ directory: this.workspaceRoot, sessionID: this.sessionId, model });
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const client = this.client;
    const sessionId = this.sessionId;
    const activeTurnId = this.eventState.activeTurnId;
    this.unsubscribeEvent?.();
    this.unsubscribeExit?.();
    this.unsubscribeReconnect?.();
    this.unsubscribeEvent = null;
    this.unsubscribeExit = null;
    this.unsubscribeReconnect = null;
    this.commandRequest = null;
    if (client && sessionId && activeTurnId && this.host.snapshot?.().state === "ready") {
      this.eventState.interruptRequested = true;
      await client.abortSession({ directory: this.workspaceRoot, sessionID: sessionId }, { timeoutMs: 2_000 }).catch(() => {});
    }
    this.client = null;
  }

  async forceTerminate() {
    // An abort that is acknowledged but never reaches a terminal event cannot
    // be treated as safe. Stop the shared harness as an unexpected exit so
    // every attached application session fails closed and can be resumed.
    await this.host.stop({ expected: false });
  }

  #attachSession(sessionId, { model, mode }) {
    if (typeof sessionId !== "string" || !/^[A-Za-z0-9:_-]{1,240}$/.test(sessionId)) {
      throw new Error("OpenCode did not return a valid session id.");
    }
    this.sessionId = sessionId;
    this.selectedModel = model || this.selectedModel;
    this.selectedMode = mode || this.selectedMode;
    this.eventState = createOpenCodeEventState();
  }

  async #applySecurityPolicy(client, mode, { force = false } = {}) {
    const policyKey = openCodePolicyKey(mode);
    if (!force && this.appliedPolicyKey === policyKey) return;
    await client.updateSession({
      directory: this.workspaceRoot,
      sessionID: this.sessionId,
      permission: createOpenCodeSessionPermissions(mode),
    });
    this.appliedPolicyKey = policyKey;
  }

  async #rejectOrphanedBlockingRequests(client, sessionId) {
    // A process/renderer restart invalidates every old UI correlation. Reject
    // native blockers instead of presenting a request that no longer has a
    // trusted application turn/request owner.
    const [permissions, questions] = await Promise.all([
      client.permissions(this.workspaceRoot).catch(() => []),
      client.questions(this.workspaceRoot).catch(() => []),
    ]);
    await Promise.all([
      ...asArray(permissions)
        .filter((request) => request?.sessionID === sessionId && typeof request?.id === "string")
        .map((request) => client.replyPermission({ directory: this.workspaceRoot, requestID: request.id, reply: "reject" })),
      ...asArray(questions)
        .filter((request) => request?.sessionID === sessionId && typeof request?.id === "string")
        .map((request) => client.rejectQuestion({ directory: this.workspaceRoot, requestID: request.id })),
    ]);
  }

  #reconcileAfterReconnect() {
    if (this.reconcilePromise || this.disposed || !this.client || !this.sessionId || !this.eventState.activeTurnId) {
      return this.reconcilePromise;
    }
    const client = this.client;
    const sessionId = this.sessionId;
    const turnId = this.eventState.activeTurnId;
    this.reconcilePromise = (async () => {
      const [messages, permissions, questions, statuses] = await Promise.all([
        client.messages({ directory: this.workspaceRoot, sessionID: sessionId }),
        client.permissions(this.workspaceRoot).catch(() => []),
        client.questions(this.workspaceRoot).catch(() => []),
        client.sessionStatus(this.workspaceRoot).catch(() => ({})),
      ]);
      if (this.disposed || this.sessionId !== sessionId || this.eventState.activeTurnId !== turnId) return;
      for (const event of normalizeOpenCodeActiveTurnHistory(messages, turnId)) this.onEvent(event);
      for (const request of asArray(permissions).filter((entry) => entry?.sessionID === sessionId)) {
        for (const event of normalizeOpenCodeEvent({ type: "permission.asked", properties: request }, this.eventState)) this.onEvent(event);
      }
      for (const request of asArray(questions).filter((entry) => entry?.sessionID === sessionId)) {
        for (const event of normalizeOpenCodeEvent({ type: "question.asked", properties: request }, this.eventState)) this.onEvent(event);
      }
      if (statuses?.[sessionId]?.type === "idle") {
        for (const event of normalizeOpenCodeEvent({ type: "session.idle", properties: { sessionID: sessionId } }, this.eventState)) this.onEvent(event);
      }
    })().catch((error) => {
      if (this.disposed) return;
      this.onEvent(agentLifecycleEvent("provider.warning", sessionId, turnId, {
        message: `OpenCode reconnected, but history reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      }));
    }).finally(() => { this.reconcilePromise = null; });
    return this.reconcilePromise;
  }

  async #handleEnvelope(envelope) {
    if (this.disposed || !this.sessionId) return;
    const directory = typeof envelope?.directory === "string" ? path.resolve(envelope.directory) : null;
    if (directory && directory !== this.workspaceRoot) return;
    const events = normalizeOpenCodeEvent(envelope, this.eventState);
    for (const event of events) {
      if (event.providerSessionId && event.providerSessionId !== this.sessionId) continue;
      this.onEvent(event);
    }
  }
}

export function normalizeProviderCatalog(value) {
  const allProviders = Array.isArray(value?.all) ? value.all.slice(0, 100) : [];
  const connected = new Set(Array.isArray(value?.connected)
    ? value.connected.flatMap((providerId) => {
      const normalized = boundedString(providerId, 160);
      return normalized ? [normalized] : [];
    })
    : []);
  const defaults = value?.default && typeof value.default === "object" ? value.default : {};
  const providers = [];
  const models = [];
  for (const provider of allProviders) {
    const providerID = boundedString(provider?.id, 160);
    if (!providerID || !connected.has(providerID)) continue;
    const providerModels = [];
    for (const model of Object.values(provider?.models ?? {}).slice(0, 500 - models.length)) {
      if (!isAgentChatModel(model)) continue;
      const modelID = boundedString(model?.id, 300);
      const selection = formatModelSelection({ providerID, modelID });
      if (!selection) continue;
      providerModels.push({
        id: selection,
        model: selection,
        providerId: providerID,
        modelId: modelID,
        displayName: boundedString(model?.name, 200) || modelID,
        description: `${boundedString(provider?.name, 160) || providerID} · ${boundedString(model?.family, 160) || modelID}`,
        isDefault: defaults[providerID] === modelID,
        variants: model?.variants ? Object.keys(model.variants).slice(0, 50).map((variant) => variant.slice(0, 100)) : [],
        contextWindow: Number(model?.limit?.context) || null,
      });
      if (models.length + providerModels.length >= 500) break;
    }
    if (providerModels.length === 0) continue;
    models.push(...providerModels);
    providers.push({
      id: providerID,
      displayName: boundedString(provider?.name, 160) || providerID,
      source: boundedString(provider?.source, 40) || null,
      defaultModel: providerModels.find((model) => model.isDefault)?.model ?? providerModels[0]?.model ?? null,
      modelCount: providerModels.length,
    });
    if (models.length >= 500) break;
  }
  models.sort((left, right) => (
    Number(right.isDefault) - Number(left.isDefault)
    || left.description.localeCompare(right.description)
  ));
  providers.sort((left, right) => providerPriority(left.id) - providerPriority(right.id)
    || left.displayName.localeCompare(right.displayName));
  return { providers, models, connectedProviderCount: connected.size };
}

function isAgentChatModel(model) {
  if (!model || typeof model !== "object" || model.status === "deprecated") return false;
  if (!model.capabilities || typeof model.capabilities !== "object") return true;
  return model.capabilities.input?.text === true
    && model.capabilities.output?.text === true
    && model.capabilities.toolcall === true;
}

function providerPriority(providerId) {
  const order = ["opencode", "opencode-go", "anthropic", "github-copilot", "openai", "google", "openrouter", "vercel"];
  const index = order.indexOf(providerId);
  return index < 0 ? order.length : index;
}

function normalizeModes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .filter((agent) => agent && agent.mode !== "subagent" && agent.hidden !== true)
    .map((agent) => ({
      id: boundedString(agent.name, 160),
      displayName: humanize(boundedString(agent.name, 160)),
      description: boundedString(agent.description, 1_000),
      isDefault: agent.name === "build" || agent.name === "agent",
    }))
    .filter((mode) => mode.id);
}

function normalizeCommands(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((command) => ({
    name: boundedString(command?.name, 160),
    description: boundedString(command?.description, 1_000),
    source: boundedString(command?.source, 100) || "command",
  })).filter((command) => command.name);
}

function normalizeSession(value, fallback = {}) {
  const info = value && typeof value === "object" ? value : {};
  const created = normalizeTime(info.time?.created) || new Date().toISOString();
  const updated = normalizeTime(info.time?.updated) || created;
  return {
    providerSessionId: typeof info.id === "string" && /^[A-Za-z0-9:_-]{1,240}$/.test(info.id) ? info.id : null,
    title: boundedString(info.title, 200) || "OpenCode session",
    model: fallback.model ?? null,
    mode: fallback.mode ?? null,
    createdAt: created,
    updatedAt: updated,
  };
}

function createPromptParts(prompt, attachments, contextReferences) {
  return [{ type: "text", text: prompt }, ...createFileParts(attachments, contextReferences)];
}

function createCommandParts(attachments, contextReferences, projectInstructions) {
  const parts = createFileParts(attachments, contextReferences);
  const system = formatAuthorizedProjectInstructions(projectInstructions);
  if (system) {
    parts.push({
      type: "file",
      mime: "text/plain",
      filename: projectInstructions.source,
      url: `data:text/plain;base64,${Buffer.from(system, "utf8").toString("base64")}`,
    });
  }
  return parts;
}

function createFileParts(attachments, contextReferences) {
  const parts = [];
  const paths = new Set();
  for (const reference of [...contextReferences, ...attachments]) {
    if (!reference?.path || paths.has(reference.path)) continue;
    paths.add(reference.path);
    parts.push({
      type: "file",
      mime: reference.mime || "text/plain",
      filename: reference.name || path.basename(reference.path),
      url: reference.snapshotUrl || pathToFileURL(reference.path).href,
    });
  }
  return parts;
}

function parseSlashCommand(prompt, commandNames) {
  const match = /^\/([A-Za-z0-9:_-]+)(?:\s+([\s\S]*))?$/.exec(prompt.trim());
  if (!match || !commandNames.has(match[1])) return null;
  return { name: match[1], arguments: match[2] ?? "" };
}

function normalizeTime(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(number < 10_000_000_000 ? number * 1000 : number).toISOString();
}

function boundedString(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;
}

function agentLifecycleEvent(type, providerSessionId, turnId, payload) {
  return { type, providerSessionId, turnId, itemId: null, payload };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function humanize(value) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

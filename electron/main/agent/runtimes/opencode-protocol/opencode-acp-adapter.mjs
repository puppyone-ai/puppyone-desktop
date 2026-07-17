import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { JsonlRpcConnection } from "../../transports/jsonl-rpc-connection.mjs";
import { AcpClient } from "../../protocols/acp/acp-client.mjs";
import { AcpEventNormalizer, normalizeAcpPromptUsage } from "../../protocols/acp/acp-event-normalizer.mjs";
import {
  resolveAcpEfforts,
  resolveAcpModels,
  resolveAcpModes,
  resolveRequestedAcpMode,
} from "../../protocols/acp/acp-session-config.mjs";
import { createAcpWorkspaceFileSystem } from "../../security/acp-workspace-files.mjs";
import {
  formatAuthorizedProjectInstructions,
  loadAuthorizedProjectInstructions,
} from "../../security/authorized-project-instructions.mjs";
import { boundRendererValue, redactSecrets, redactSecretText } from "../../agent-events.mjs";
import { managedOpenCodeAcpConfig } from "./opencode-security-policy.mjs";

const METADATA_SETTLE_MS = 75;

export const OPENCODE_ACP_CAPABILITIES = Object.freeze({
  streamingText: true,
  structuredToolEvents: true,
  commandOutputStreaming: true,
  fileChangeEvents: true,
  manualApprovals: true,
  structuredQuestions: false,
  resume: true,
  fork: false,
  steer: false,
  queue: false,
  attachments: false,
  contextReferences: true,
  modelSelection: true,
  modeSelection: true,
  slashCommands: true,
  sessionHistory: false,
  usage: true,
  accountState: true,
  mcp: true,
  skills: true,
  compaction: false,
});

/** One workspace-bound adapter around an OpenCode-owned ACP harness. */
export class OpenCodeAcpAdapter {
  constructor({
    readiness,
    workspaceRoot,
    runtimeDescriptor,
    managed = false,
    appVersion = "0.0.0",
    onEvent = () => {},
    onExit = () => {},
    logger = console,
    connectionFactory = (options) => new JsonlRpcConnection(options),
    fileSystemFactory = createAcpWorkspaceFileSystem,
    projectInstructionLoader = loadAuthorizedProjectInstructions,
    onDispose = () => {},
  }) {
    if (!runtimeDescriptor?.id) throw new TypeError("OpenCode ACP adapter requires a runtime descriptor.");
    this.readiness = readiness ?? {};
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.runtimeDescriptor = runtimeDescriptor;
    this.managed = managed;
    this.appVersion = appVersion;
    this.onEvent = onEvent;
    this.onExit = onExit;
    this.logger = logger;
    this.connectionFactory = connectionFactory;
    this.fileSystemFactory = fileSystemFactory;
    this.projectInstructionLoader = projectInstructionLoader;
    this.onDispose = onDispose;
    this.connection = null;
    this.client = null;
    this.connectionMode = null;
    this.sessionId = null;
    this.sessionConfig = emptySessionConfig();
    this.commands = [];
    this.activeTurn = null;
    this.pendingApprovals = new Map();
    this.exitExpected = false;
    this.disposed = false;
  }

  hasActiveProcess() {
    return Boolean(this.connection && !this.connection.closed);
  }

  async inspect() {
    this.#assertUsable();
    await this.#connect("metadata");
    try {
      const response = await this.client.newSession({ cwd: this.workspaceRoot, mcpServers: [] });
      this.sessionId = requiredId(response?.sessionId ?? this.sessionId, "OpenCode ACP session id");
      this.#syncSession(response);
      // ACP publishes optional commands/config updates as notifications after
      // newSession. A short bounded settle window captures them without
      // turning provider discovery into a full runtime boot.
      await delay(METADATA_SETTLE_MS);
      const models = publicModels(this.sessionConfig);
      const accountReady = models.length > 0;
      return {
        account: {
          account: accountReady ? {
            type: this.managed ? "puppyone-agent" : "opencode-native",
            email: null,
            planType: null,
          } : null,
          requiresOpenaiAuth: false,
          requiresRuntimeSetup: !accountReady,
          ...(!accountReady ? { error: `${this.runtimeDescriptor.displayName} has no authenticated model available.` } : {}),
        },
        providers: publicProviders(models),
        models,
        modes: publicModes(this.sessionConfig),
        commands: this.commands,
        capabilities: this.#capabilities(),
        runtime: {
          ...this.runtimeDescriptor,
          version: this.readiness.version ?? this.client.agentInfo?.version ?? null,
          source: this.readiness.source ?? (this.managed ? "bundled" : "user-installed"),
          compatibility: "acp-v1",
        },
        warnings: [],
      };
    } finally {
      await this.#disconnect("OpenCode ACP metadata inspection completed.");
    }
  }

  async createSession({ model = null, mode = null } = {}) {
    this.#assertIdle();
    await this.#connect("session");
    const response = await this.client.newSession({ cwd: this.workspaceRoot, mcpServers: [] });
    this.sessionId = requiredId(response?.sessionId, "OpenCode ACP session id");
    this.#syncSession(response);
    await this.#applySelection({ model, mode });
    const now = new Date().toISOString();
    return {
      providerSessionId: this.sessionId,
      title: this.managed ? "New PuppyOne Agent session" : "New OpenCode session",
      model: this.sessionConfig.models.currentId ?? model,
      mode: this.sessionConfig.modes.currentId ?? mode,
      createdAt: now,
      updatedAt: now,
    };
  }

  async resumeSession({ threadId, model = null, mode = null } = {}) {
    this.#assertIdle();
    await this.#connect("session");
    const response = await this.client.loadSession({
      cwd: this.workspaceRoot,
      mcpServers: [],
      sessionId: requiredId(threadId, "OpenCode ACP session id"),
    });
    this.sessionId = requiredId(response?.sessionId ?? threadId, "OpenCode ACP session id");
    this.#syncSession(response);
    await this.#applySelection({ model, mode });
    const now = new Date().toISOString();
    return {
      providerSessionId: this.sessionId,
      title: this.managed ? "PuppyOne Agent session" : "OpenCode session",
      model: this.sessionConfig.models.currentId ?? model,
      mode: this.sessionConfig.modes.currentId ?? mode,
      createdAt: now,
      updatedAt: now,
    };
  }

  async readHistory() {
    // Native history remains owned by OpenCode. PuppyOne deliberately does not
    // create or persist a second transcript authority.
    return [];
  }

  async startTurn({ prompt, model = null, mode = null, attachments = [], contextReferences = [] }) {
    this.#assertUsable();
    if (!this.client || !this.sessionId) throw new Error("OpenCode ACP session is not connected.");
    if (this.activeTurn) throw new Error("An OpenCode turn is already running.");
    await this.#applySelection({ model, mode });
    const turnId = `opencode:${randomUUID()}`;
    const normalizer = new AcpEventNormalizer({ turnId });
    const instructions = await this.projectInstructionLoader(this.workspaceRoot);
    const blocks = buildPromptBlocks({
      prompt,
      instructions: formatAuthorizedProjectInstructions(instructions),
      references: [...contextReferences, ...attachments],
      workspaceRoot: this.workspaceRoot,
    });
    const active = { turnId, normalizer, interrupted: false };
    this.activeTurn = active;
    void this.#runPrompt(active, blocks);
    return { turnId };
  }

  async interruptTurn({ turnId }) {
    if (!this.activeTurn || this.activeTurn.turnId !== turnId || !this.sessionId) {
      throw new Error("That OpenCode turn is no longer running.");
    }
    this.activeTurn.interrupted = true;
    this.client.cancel({ sessionId: this.sessionId });
  }

  resolveApproval({ requestId, decision, turnId }) {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending || pending.turnId !== turnId || this.activeTurn?.turnId !== turnId) {
      throw new Error("Approval correlation did not match the active OpenCode turn.");
    }
    this.pendingApprovals.delete(requestId);
    const option = selectPermissionOption(pending.options, decision);
    pending.resolve(option
      ? { outcome: { outcome: "selected", optionId: option.optionId } }
      : { outcome: { outcome: "cancelled" } });
  }

  forceTerminate(reason = "OpenCode ACP runtime stopped.") {
    return this.#disconnect(reason, { expected: false });
  }

  async dispose(reason = "OpenCode ACP adapter closed.") {
    if (this.disposed) return;
    this.disposed = true;
    this.#resolvePending(reason);
    await this.#disconnect(reason);
    this.onDispose(this);
  }

  async #runPrompt(active, blocks) {
    try {
      const response = await this.client.prompt({
        sessionId: this.sessionId,
        prompt: blocks,
      });
      if (this.activeTurn !== active || this.disposed) return;
      for (const event of active.normalizer.completeAssistant(this.sessionId)) this.onEvent(event);
      const usage = normalizeAcpPromptUsage(response?.usage);
      if (usage) this.onEvent(event("usage.updated", this.sessionId, active.turnId, null, usage));
      this.onEvent(event(active.interrupted ? "turn.interrupted" : "turn.completed", this.sessionId, active.turnId, null, {
        status: active.interrupted ? "interrupted" : "completed",
        stopReason: text(response?.stopReason, 160) || null,
      }));
    } catch (error) {
      if (this.activeTurn !== active || this.disposed) return;
      const interrupted = active.interrupted;
      if (!interrupted) {
        this.onEvent(event("provider.error", this.sessionId, active.turnId, null, {
          message: redactSecretText(error instanceof Error ? error.message : String(error)),
          recoverable: true,
        }));
      }
      this.onEvent(event(interrupted ? "turn.interrupted" : "turn.failed", this.sessionId, active.turnId, null, {
        status: interrupted ? "interrupted" : "failed",
      }));
    } finally {
      if (this.activeTurn === active) {
        this.#resolvePending("OpenCode turn ended before the permission request was resolved.");
        this.activeTurn = null;
      }
    }
  }

  async #connect(mode) {
    if (this.connection && !this.connection.closed && this.connectionMode === mode) return;
    if (this.connection) await this.#disconnect("OpenCode ACP connection mode changed.");
    const environment = this.#environment(mode);
    this.exitExpected = false;
    const connection = this.connectionFactory({
      executablePath: this.readiness.executablePath,
      args: [
        "acp",
        `--cwd=${this.workspaceRoot}`,
        ...(this.managed ? ["--hostname=127.0.0.1", "--port=0", "--pure"] : []),
      ],
      cwd: this.workspaceRoot,
      env: environment,
    });
    this.connection = connection;
    this.connectionMode = mode;
    connection.once?.("exit", (info) => {
      if (this.connection !== connection) return;
      this.connection = null;
      this.client = null;
      this.connectionMode = null;
      if (!this.exitExpected && !this.disposed) {
        this.#resolvePending("OpenCode ACP process exited.");
        this.onExit({
          code: info?.code ?? null,
          signal: info?.signal ?? null,
          error: redactSecretText(info?.error || "OpenCode ACP process exited unexpectedly."),
          diagnostics: redactSecretText(info?.diagnostics || ""),
          expected: false,
        });
      }
    });
    const fileSystem = this.fileSystemFactory({ workspaceRoot: this.workspaceRoot });
    this.client = new AcpClient({
      connection,
      clientInfo: { name: "puppyone-desktop", title: "PuppyOne Desktop", version: this.appVersion },
      delegate: {
        readTextFile: (request) => this.#withSession(request, () => fileSystem.readTextFile(request)),
        writeTextFile: (request) => this.#withSession(request, () => fileSystem.writeTextFile(request)),
        requestPermission: (request) => this.#requestPermission(request),
        onSessionUpdate: (notification) => this.#handleSessionUpdate(notification),
      },
    });
    await this.client.initialize();
  }

  async #disconnect(reason, { expected = true } = {}) {
    this.exitExpected = expected;
    const client = this.client;
    const connection = this.connection;
    this.client = null;
    this.connection = null;
    this.connectionMode = null;
    client?.dispose();
    connection?.dispose?.(reason, { expected });
    await Promise.resolve();
  }

  #environment(mode) {
    const environment = cleanEnvironment(this.readiness.environment ?? {});
    environment.PUPPYONE_AGENT_BACKEND = this.runtimeDescriptor.id;
    if (mode === "metadata") environment.OPENCODE_DB = ":memory:";
    if (this.managed) {
      const overlay = managedOpenCodeAcpConfig();
      environment.OPENCODE_CONFIG_CONTENT = mergeJsonConfig(environment.OPENCODE_CONFIG_CONTENT, overlay);
    }
    return environment;
  }

  #capabilities() {
    const native = this.client?.agentCapabilities ?? {};
    return {
      ...OPENCODE_ACP_CAPABILITIES,
      resume: native.loadSession === true || Boolean(native.sessionCapabilities?.resume),
      mcp: Boolean(native.mcpCapabilities?.http || native.mcpCapabilities?.sse),
      attachments: Boolean(native.promptCapabilities?.image || native.promptCapabilities?.audio),
    };
  }

  #syncSession(response = {}) {
    const configOptions = Array.isArray(response.configOptions) ? response.configOptions : [];
    this.sessionConfig = {
      configOptions,
      models: resolveAcpModels({ configOptions, models: response.models }),
      modes: resolveAcpModes({ configOptions, modes: response.modes }),
      efforts: resolveAcpEfforts({ configOptions }),
    };
  }

  async #applySelection({ model, mode }) {
    if (!this.client || !this.sessionId) return;
    const requestedModel = text(model, 512);
    if (requestedModel && requestedModel !== this.sessionConfig.models.currentId) {
      if (!this.sessionConfig.models.available.some((entry) => entry.id === requestedModel)) {
        throw new Error("The selected OpenCode model is no longer available.");
      }
      const configId = this.sessionConfig.models.configId;
      if (!configId) throw new Error("This OpenCode ACP runtime does not support changing models.");
      const response = await this.client.setConfigOption({
        configId,
        sessionId: this.sessionId,
        type: "select",
        value: requestedModel,
      });
      this.#syncConfigOptions(response?.configOptions);
    }
    const requestedMode = resolveRequestedAcpMode(mode, this.sessionConfig.modes);
    if (requestedMode && requestedMode !== this.sessionConfig.modes.currentId) {
      if (this.sessionConfig.modes.configId) {
        const response = await this.client.setConfigOption({
          configId: this.sessionConfig.modes.configId,
          sessionId: this.sessionId,
          type: "select",
          value: requestedMode,
        });
        this.#syncConfigOptions(response?.configOptions);
      } else {
        await this.client.setMode({ sessionId: this.sessionId, modeId: requestedMode });
        this.sessionConfig.modes.currentId = requestedMode;
      }
    }
  }

  #syncConfigOptions(value) {
    if (!Array.isArray(value)) return;
    this.sessionConfig.configOptions = value;
    this.sessionConfig.models = resolveAcpModels({ configOptions: value });
    this.sessionConfig.modes = resolveAcpModes({ configOptions: value });
    this.sessionConfig.efforts = resolveAcpEfforts({ configOptions: value });
  }

  async #handleSessionUpdate(notification) {
    if (!notification) return;
    if (!this.sessionId && safeId(notification.sessionId)) this.sessionId = notification.sessionId;
    if (notification.sessionId !== this.sessionId) return;
    const update = notification.update;
    if (update?.sessionUpdate === "available_commands_update") {
      this.commands = array(update.availableCommands).slice(0, 500).map((command) => ({
        name: text(command?.name, 160).replace(/^\//u, ""),
        description: text(command?.description, 1_000),
        argumentHint: text(command?.input?.hint, 500),
        source: "opencode-acp",
      })).filter((command) => command.name);
      return;
    }
    if (update?.sessionUpdate === "config_option_update") {
      this.#syncConfigOptions(update.configOptions);
      return;
    }
    if (update?.sessionUpdate === "current_mode_update") {
      this.sessionConfig.modes.currentId = text(update.currentModeId, 160) || null;
      return;
    }
    if (!this.activeTurn) return;
    for (const normalized of this.activeTurn.normalizer.normalize(notification)) this.onEvent(normalized);
  }

  #requestPermission(request) {
    if (!this.activeTurn || request?.sessionId !== this.sessionId) {
      return Promise.resolve({ outcome: { outcome: "cancelled" } });
    }
    const options = array(request.options).filter((option) => safeId(option?.optionId));
    const requestId = `opencode:${safeId(request.toolCall?.toolCallId) ?? randomUUID()}:${randomUUID()}`;
    const input = record(request.toolCall?.rawInput);
    return new Promise((resolve) => {
      this.pendingApprovals.set(requestId, {
        requestId,
        turnId: this.activeTurn.turnId,
        options,
        resolve,
      });
      this.onEvent(event("approval.requested", this.sessionId, this.activeTurn.turnId,
        safeId(request.toolCall?.toolCallId), {
          requestId,
          title: text(request.toolCall?.title, 300) || "Approval required",
          kind: approvalKind(request.toolCall?.kind),
          command: text(input.command, 8_192) || null,
          reason: text(request.toolCall?.title, 2_000) || null,
          availableDecisions: availableDecisions(options),
          arguments: boundRendererValue(redactSecrets(input)),
        }));
    });
  }

  #withSession(request, operation) {
    if (!this.sessionId || request?.sessionId !== this.sessionId) {
      throw new Error("ACP file request does not belong to the active OpenCode session.");
    }
    return operation();
  }

  #resolvePending(message) {
    for (const pending of this.pendingApprovals.values()) {
      pending.resolve({ outcome: { outcome: "cancelled" } });
    }
    if (this.pendingApprovals.size > 0) this.logger.warn?.(redactSecretText(message));
    this.pendingApprovals.clear();
  }

  #assertIdle() {
    this.#assertUsable();
    if (this.activeTurn) throw new Error("Stop the active OpenCode turn first.");
  }

  #assertUsable() {
    if (this.disposed) throw new Error("OpenCode ACP adapter is closed.");
    if (!this.readiness.executablePath) throw new Error("OpenCode ACP executable is unavailable.");
  }
}

function publicModels(config) {
  const variants = config.efforts.available.map((entry) => entry.id);
  return config.models.available.map((model, index) => {
    const providerId = model.id.includes("/") ? model.id.slice(0, model.id.indexOf("/")) : "opencode";
    const modelId = model.id.includes("/") ? model.id.slice(model.id.indexOf("/") + 1) : model.id;
    return {
      id: model.id,
      model: model.id,
      providerId,
      modelId,
      displayName: model.name || model.id,
      description: model.description || "",
      isDefault: model.id === config.models.currentId || (!config.models.currentId && index === 0),
      variants,
      defaultVariant: variants.includes(config.efforts.currentId) ? config.efforts.currentId : variants[0] ?? null,
    };
  });
}

function publicProviders(models) {
  const groups = new Map();
  for (const model of models) {
    const id = model.providerId || "opencode";
    const current = groups.get(id) ?? { id, displayName: humanize(id), source: "native", defaultModel: null, modelCount: 0 };
    current.modelCount += 1;
    if (model.isDefault) current.defaultModel = model.model;
    groups.set(id, current);
  }
  return Array.from(groups.values());
}

function publicModes(config) {
  return config.modes.available.map((mode, index) => ({
    id: mode.id,
    displayName: mode.name || humanize(mode.id),
    description: mode.description || "",
    isDefault: mode.id === config.modes.currentId || (!config.modes.currentId && index === 0),
  }));
}

function buildPromptBlocks({ prompt, instructions, references, workspaceRoot }) {
  const content = instructions ? `${instructions}\n\nUser request:\n${prompt}` : prompt;
  const blocks = [{ type: "text", text: content }];
  const seen = new Set();
  for (const reference of array(references)) {
    const filename = typeof reference?.path === "string" ? path.resolve(reference.path) : null;
    if (!filename || !isInsideWorkspace(workspaceRoot, filename) || seen.has(filename)) continue;
    seen.add(filename);
    blocks.push({
      type: "resource_link",
      uri: pathToFileURL(filename).href,
      name: text(reference?.name, 300) || path.basename(filename),
      title: text(reference?.name, 300) || path.basename(filename),
    });
  }
  return blocks;
}

function isInsideWorkspace(workspaceRoot, filename) {
  const relative = path.relative(workspaceRoot, filename);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function selectPermissionOption(options, decision) {
  const desired = decision === "acceptForSession"
    ? ["allow_always", "allow_once"]
    : decision === "accept"
      ? ["allow_once", "allow_always"]
      : decision === "decline"
        ? ["reject_once", "reject_always"]
        : [];
  return desired.map((kind) => options.find((option) => option.kind === kind)).find(Boolean) ?? null;
}

function availableDecisions(options) {
  const decisions = [];
  if (options.some((option) => option.kind === "allow_once" || option.kind === "allow_always")) decisions.push("accept");
  if (options.some((option) => option.kind === "allow_always")) decisions.push("acceptForSession");
  if (options.some((option) => option.kind === "reject_once" || option.kind === "reject_always")) decisions.push("decline");
  decisions.push("cancel");
  return decisions;
}

function approvalKind(kind) {
  return ["edit", "delete", "move"].includes(kind) ? "file-change" : kind === "execute" ? "command" : "tool";
}

function mergeJsonConfig(value, overlay) {
  let base = {};
  try {
    const parsed = value ? JSON.parse(value) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) base = parsed;
  } catch {
    // A malformed inherited inline config is not forwarded into the managed runtime.
  }
  return JSON.stringify({
    ...base,
    ...overlay,
    agent: { ...(record(base.agent)), ...(record(overlay.agent)) },
  });
}

function emptySessionConfig() {
  return {
    configOptions: [],
    models: { configId: null, currentId: null, available: [] },
    modes: { configId: null, currentId: null, available: [] },
    efforts: { configId: null, currentId: null, available: [] },
  };
}

function event(type, providerSessionId, turnId, itemId, payload) {
  return { type, providerSessionId: safeId(providerSessionId), turnId: safeId(turnId), itemId: safeId(itemId), payload };
}

function cleanEnvironment(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === "string"));
}

function requiredId(value, label) {
  const id = safeId(value);
  if (!id) throw new Error(`${label} is invalid.`);
  return id;
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value) ? value : null;
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function humanize(value) {
  return text(value, 160).replace(/[-_.]+/gu, " ").replace(/\b\w/gu, (character) => character.toUpperCase());
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

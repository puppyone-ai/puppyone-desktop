import { randomUUID } from "node:crypto";
import { JsonlRpcConnection } from "./codex-jsonl-rpc-connection.mjs";
import { boundRendererValue, redactSecrets, redactSecretText } from "../../agent-events.mjs";

export const CODEX_CAPABILITIES = Object.freeze({
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
  contextReferences: false,
  modelSelection: true,
  modeSelection: false,
  slashCommands: false,
  sessionHistory: true,
  usage: true,
  accountState: true,
  mcp: false,
  skills: false,
  compaction: false,
});

export class CodexAppServerAdapter {
  constructor({
    executablePath,
    environment,
    workspaceRoot,
    appVersion,
    spawn,
    connectionFactory,
    onEvent = () => {},
    onExit = () => {},
  }) {
    this.executablePath = executablePath;
    this.environment = environment;
    this.workspaceRoot = workspaceRoot;
    this.appVersion = appVersion;
    this.spawn = spawn;
    this.connectionFactory = connectionFactory;
    this.onEvent = onEvent;
    this.onExit = onExit;
    this.connection = null;
    this.threadId = null;
    this.activeTurnId = null;
    this.pendingApprovals = new Map();
    this.modelProfiles = new Map();
    this.sessionLifecycleType = null;
    this.disposed = false;
  }

  async connect() {
    if (this.connection) return;
    const createConnection = this.connectionFactory || ((options) => new JsonlRpcConnection(options));
    const connection = createConnection({
      executablePath: this.executablePath,
      args: ["app-server", "--listen", "stdio://"],
      cwd: this.workspaceRoot,
      env: this.environment,
      ...(this.spawn ? { spawn: this.spawn } : {}),
    });
    this.connection = connection;
    connection.on("notification", (message) => this.#handleNotification(message));
    connection.on("request", (message) => this.#handleServerRequest(message));
    connection.on("protocolError", (error) => {
      this.lastConnectionError = redactSecretText(error.message);
    });
    connection.on("exit", (info) => {
      this.#clearPendingApprovals("cancel", false);
      this.onExit(info);
    });
    try {
      await connection.request("initialize", {
        clientInfo: {
          name: "puppyone_desktop",
          title: "PuppyOne Desktop",
          version: this.appVersion,
        },
        capabilities: {
          experimentalApi: false,
          requestAttestation: false,
        },
      });
      connection.notify("initialized");
    } catch (error) {
      const diagnostic = connection.getDiagnostics?.() || "";
      connection.dispose();
      throw new Error(redactSecretText([
        error instanceof Error ? error.message : String(error),
        diagnostic,
      ].filter(Boolean).join(" ")));
    }
  }

  async inspect() {
    await this.connect();
    const [accountResult, modelResult] = await Promise.allSettled([
      this.connection.request("account/read", { refreshToken: false }),
      this.connection.request("model/list", { includeHidden: false, limit: 100 }),
    ]);
    if (accountResult.status === "rejected" && modelResult.status === "rejected") {
      throw new Error(redactSecretText(
        accountResult.reason?.message
        || modelResult.reason?.message
        || "Codex account and model inspection failed.",
      ));
    }
    const account = accountResult.status === "fulfilled"
      ? normalizeAccount(accountResult.value)
      : { account: null, requiresOpenaiAuth: false, error: redactSecretText(accountResult.reason?.message || String(accountResult.reason)) };
    const models = modelResult.status === "fulfilled"
      ? normalizeModels(modelResult.value)
      : [];
    this.modelProfiles = new Map(models.map((model) => [model.model, model]));
    return {
      account,
      models,
      modes: [],
      commands: [],
      capabilities: CODEX_CAPABILITIES,
      runtime: {
        id: "codex",
        displayName: "Codex CLI",
        description: "Direct local Codex app-server compatibility runtime.",
        kind: "direct-cli",
        iconKey: "codex",
        version: null,
        source: "external",
        compatibility: "versioned-app-server",
      },
      warnings: [
        ...(accountResult.status === "rejected" ? [account.error] : []),
        ...(modelResult.status === "rejected" ? [redactSecretText(modelResult.reason?.message || String(modelResult.reason))] : []),
      ].filter(Boolean),
    };
  }

  async createSession({ model = null }) {
    await this.connect();
    this.sessionLifecycleType = "session.started";
    const result = await this.connection.request("thread/start", {
      cwd: this.workspaceRoot,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      ephemeral: false,
      threadSource: "puppyone-desktop",
      ...(model ? { model } : {}),
    }).finally(() => { this.sessionLifecycleType = null; });
    this.threadId = requireString(result?.thread?.id, "Codex thread/start did not return a thread id.");
    return normalizeProviderSession(result);
  }

  async resumeSession({ threadId, model = null }) {
    await this.connect();
    this.sessionLifecycleType = "session.resumed";
    const result = await this.connection.request("thread/resume", {
      threadId,
      cwd: this.workspaceRoot,
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      ...(model ? { model } : {}),
    }).finally(() => { this.sessionLifecycleType = null; });
    this.threadId = requireString(result?.thread?.id, "Codex thread/resume did not return a thread id.");
    return normalizeProviderSession(result);
  }

  async readThread() {
    if (!this.threadId) throw new Error("No Codex thread is active.");
    const result = await this.connection.request("thread/read", {
      threadId: this.threadId,
      includeTurns: true,
    });
    return result?.thread ?? null;
  }

  async readHistory() {
    return normalizeHistoricalThread(await this.readThread());
  }

  async startTurn({ prompt, model = null }) {
    if (!this.threadId) throw new Error("No Codex thread is active.");
    const clientUserMessageId = randomUUID();
    const effort = compatibleReasoningEffort(this.modelProfiles.get(model));
    const result = await this.connection.request("turn/start", {
      threadId: this.threadId,
      clientUserMessageId,
      input: [{ type: "text", text: prompt, text_elements: [] }],
      cwd: this.workspaceRoot,
      approvalPolicy: "on-request",
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    });
    this.activeTurnId = requireString(result?.turn?.id, "Codex turn/start did not return a turn id.");
    return { turnId: this.activeTurnId, clientUserMessageId };
  }

  async interruptTurn({ turnId }) {
    if (!this.threadId) throw new Error("No Codex thread is active.");
    await this.connection.request("turn/interrupt", {
      threadId: this.threadId,
      turnId,
    });
    this.#clearPendingApprovals("cancel", true);
  }

  resolveApproval({ requestId, decision, threadId, turnId }) {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) throw new Error("This approval is no longer pending.");
    if (pending.threadId !== threadId || pending.turnId !== turnId || pending.threadId !== this.threadId) {
      throw new Error("Approval correlation did not match the active Codex turn.");
    }
    if (!pending.availableDecisions.includes(decision)) {
      throw new Error("Codex did not offer that approval decision.");
    }
    this.connection.respond(pending.rpcId, { decision });
    this.pendingApprovals.delete(requestId);
  }

  dispose(reason = "Codex app-server adapter closed.") {
    if (this.disposed) return;
    this.disposed = true;
    this.#clearPendingApprovals("cancel", true);
    this.connection?.dispose(reason);
  }

  #handleNotification(message) {
    if (message?.method === "serverRequest/resolved") {
      this.#handleServerRequestResolved(message.params ?? {});
      return;
    }
    const events = normalizeCodexNotification(message);
    for (const event of events) {
      if (event.type === "session.started" && this.sessionLifecycleType === "session.resumed") {
        event.type = "session.resumed";
      }
      if (event.type.startsWith("turn.") && event.turnId) {
        if (event.type === "turn.started") this.activeTurnId = event.turnId;
        if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) {
          this.activeTurnId = null;
          this.#clearPendingApprovalsForTurn(event.turnId, "turn-ended");
        }
      }
      this.onEvent(event);
    }
  }

  #handleServerRequest(message) {
    const { method, id, params = {} } = message;
    if (method !== "item/commandExecution/requestApproval" && method !== "item/fileChange/requestApproval") {
      this.connection.respondError(id, -32601, `Unsupported Codex server request: ${method}`);
      this.onEvent({
        type: "provider.warning",
        turnId: typeof params.turnId === "string" ? params.turnId : null,
        itemId: typeof params.itemId === "string" ? params.itemId : null,
        payload: { message: `Codex requested unsupported input (${method}); it was denied.` },
      });
      return;
    }
    if (
      typeof params.threadId !== "string"
      || params.threadId !== this.threadId
      || typeof params.turnId !== "string"
      || typeof params.itemId !== "string"
    ) {
      this.connection.respond(id, { decision: "cancel" });
      this.onEvent({
        type: "provider.error",
        payload: { message: "A Codex approval had impossible session ownership and was cancelled.", recoverable: false },
      });
      return;
    }
    const explicitDecisions = Array.isArray(params.availableDecisions)
      ? params.availableDecisions.filter(isApprovalDecision)
      : [];
    const availableDecisions = explicitDecisions.length > 0
      ? explicitDecisions
      : ["accept", "decline", "cancel"];
    const requestId = `codex:${String(id)}`;
    const kind = method.includes("commandExecution") ? "command" : "file-change";
    const networkApprovalContext = normalizeNetworkApprovalContext(params.networkApprovalContext);
    this.pendingApprovals.set(requestId, {
      rpcId: id,
      requestId,
      kind,
      threadId: params.threadId,
      turnId: params.turnId,
      itemId: params.itemId,
      availableDecisions,
    });
    this.onEvent({
      type: "approval.requested",
      providerSessionId: params.threadId,
      turnId: params.turnId,
      itemId: params.itemId,
      payload: boundRendererValue(redactSecrets({
        requestId,
        kind,
        title: networkApprovalContext
          ? "Allow network access"
          : kind === "command"
            ? "Run command"
            : "Apply file changes",
        command: typeof params.command === "string" ? params.command : null,
        cwd: typeof params.cwd === "string" ? params.cwd : null,
        commandActions: Array.isArray(params.commandActions) ? params.commandActions : [],
        networkApprovalContext,
        reason: typeof params.reason === "string" ? params.reason : null,
        grantRoot: typeof params.grantRoot === "string" ? params.grantRoot : null,
        proposedExecpolicyAmendment: params.proposedExecpolicyAmendment ?? null,
        proposedNetworkPolicyAmendments: Array.isArray(params.proposedNetworkPolicyAmendments)
          ? params.proposedNetworkPolicyAmendments
          : [],
        availableDecisions,
        startedAtMs: Number.isFinite(params.startedAtMs) ? params.startedAtMs : Date.now(),
      })),
    });
  }

  #handleServerRequestResolved(params) {
    const providerRequestId = params?.requestId;
    if (typeof providerRequestId !== "string" && typeof providerRequestId !== "number") return;
    const normalizedProviderId = String(providerRequestId).replace(/^codex:/, "");
    const pending = Array.from(this.pendingApprovals.values()).find((entry) => (
      String(entry.rpcId) === normalizedProviderId || entry.requestId === String(providerRequestId)
    ));
    if (!pending) return;
    this.pendingApprovals.delete(pending.requestId);
    this.onEvent({
      type: "approval.resolved",
      providerSessionId: pending.threadId,
      turnId: pending.turnId,
      itemId: pending.itemId,
      payload: { requestId: pending.requestId, decision: "cancel", reason: "provider-resolved" },
    });
  }

  #clearPendingApprovalsForTurn(turnId, reason) {
    if (!turnId) return;
    for (const pending of Array.from(this.pendingApprovals.values())) {
      if (pending.turnId !== turnId) continue;
      this.pendingApprovals.delete(pending.requestId);
      this.onEvent({
        type: "approval.resolved",
        providerSessionId: pending.threadId,
        turnId: pending.turnId,
        itemId: pending.itemId,
        payload: { requestId: pending.requestId, decision: "cancel", reason },
      });
    }
  }

  #clearPendingApprovals(decision, respond) {
    for (const pending of this.pendingApprovals.values()) {
      if (respond && this.connection && !this.connection.closed) {
        try {
          this.connection.respond(pending.rpcId, { decision });
        } catch {
          // A closed provider cannot execute an unapproved action.
        }
      }
      this.onEvent({
        type: "approval.resolved",
        providerSessionId: pending.threadId,
        turnId: pending.turnId,
        itemId: pending.itemId,
        payload: { requestId: pending.requestId, decision, reason: "adapter-closed" },
      });
    }
    this.pendingApprovals.clear();
  }
}

export function normalizeCodexNotification(message) {
  const method = message?.method;
  const params = message?.params ?? {};
  const threadId = stringOrNull(params.threadId);
  const turnId = stringOrNull(params.turnId ?? params.turn?.id);
  const item = params.item && typeof params.item === "object" ? params.item : null;
  const itemId = stringOrNull(params.itemId ?? item?.id);
  switch (method) {
    case "thread/started": {
      const thread = params.thread ?? {};
      return [{
        type: "session.started",
        providerSessionId: stringOrNull(thread.id),
        payload: {
          title: thread.name || thread.preview || "Codex session",
          createdAt: toIsoFromSeconds(thread.createdAt),
          updatedAt: toIsoFromSeconds(thread.updatedAt),
        },
      }];
    }
    case "thread/status/changed":
      return params.status?.type === "systemError"
        ? [{ type: "provider.error", providerSessionId: threadId, payload: { message: "Codex thread entered a system error state.", recoverable: true } }]
        : [];
    case "turn/started":
      return [{ type: "turn.started", providerSessionId: threadId, turnId, payload: { status: "running" } }];
    case "turn/completed": {
      const status = params.turn?.status;
      const type = status === "interrupted" ? "turn.interrupted" : status === "failed" ? "turn.failed" : "turn.completed";
      return [{
        type,
        providerSessionId: threadId,
        turnId,
        payload: {
          status: normalizeTurnStatus(status),
          ...(params.turn?.error?.message ? { message: formatCodexErrorMessage(params.turn.error.message) } : {}),
        },
      }];
    }
    case "item/started":
      return normalizeItemLifecycle(item, "started", threadId, turnId);
    case "item/completed":
      return normalizeItemLifecycle(item, "completed", threadId, turnId);
    case "item/agentMessage/delta":
      return [{ type: "assistant.delta", providerSessionId: threadId, turnId, itemId, payload: { delta: String(params.delta ?? "") } }];
    case "item/reasoning/summaryTextDelta":
      return [{ type: "reasoning.summary.delta", providerSessionId: threadId, turnId, itemId, payload: { delta: String(params.delta ?? ""), summaryIndex: params.summaryIndex ?? 0 } }];
    case "turn/plan/updated":
      return [{ type: "plan.updated", providerSessionId: threadId, turnId, payload: { explanation: stringOrNull(params.explanation), steps: normalizePlan(params.plan) } }];
    case "item/plan/delta":
      return [{ type: "plan.updated", providerSessionId: threadId, turnId, itemId, payload: { text: String(params.delta ?? ""), streaming: true } }];
    case "item/commandExecution/outputDelta":
      return [{ type: "command.output.delta", providerSessionId: threadId, turnId, itemId, payload: { delta: String(params.delta ?? "") } }];
    case "item/fileChange/outputDelta":
      return [{ type: "tool.progress", providerSessionId: threadId, turnId, itemId, payload: { delta: String(params.delta ?? "") } }];
    case "item/fileChange/patchUpdated":
      return [{ type: "file.change.updated", providerSessionId: threadId, turnId, itemId, payload: { changes: summarizeFileChanges(params.changes) } }];
    case "item/mcpToolCall/progress":
      return [{ type: "tool.progress", providerSessionId: threadId, turnId, itemId, payload: boundRendererValue(redactSecrets(params)) }];
    case "thread/tokenUsage/updated":
      return [{ type: "usage.updated", providerSessionId: threadId, turnId, payload: boundRendererValue(params.tokenUsage ?? {}) }];
    case "error":
      return [{
        type: params.willRetry ? "provider.warning" : "provider.error",
        providerSessionId: threadId,
        turnId,
        payload: { message: formatCodexErrorMessage(params.error, "Codex reported an error."), recoverable: Boolean(params.willRetry) },
      }];
    case "warning":
    case "configWarning":
    case "deprecationNotice":
      return [{ type: "provider.warning", providerSessionId: threadId, turnId, payload: { message: formatProviderWarning(params) } }];
    default:
      return [];
  }
}

export function normalizeHistoricalThread(thread) {
  const events = [];
  if (!thread || !Array.isArray(thread.turns)) return events;
  for (const turn of thread.turns) {
    const turnId = stringOrNull(turn?.id);
    const items = Array.isArray(turn?.items) ? turn.items : [];
    const prompt = items
      .filter((item) => item?.type === "userMessage")
      .flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .filter((content) => content?.type === "text" && typeof content.text === "string")
      .map((content) => content.text)
      .join("\n");
    events.push({
      type: "turn.started",
      providerSessionId: thread.id,
      turnId,
      payload: { status: "running", restored: true, ...(prompt ? { prompt } : {}) },
    });
    for (const item of items) {
      events.push(...normalizeItemLifecycle(item, "completed", thread.id, turnId));
    }
    const type = turn.status === "interrupted" ? "turn.interrupted" : turn.status === "failed" ? "turn.failed" : "turn.completed";
    events.push({ type, providerSessionId: thread.id, turnId, payload: { status: normalizeTurnStatus(turn.status), restored: true } });
  }
  return events;
}

function normalizeItemLifecycle(item, phase, threadId, turnId) {
  if (!item || typeof item !== "object") return [];
  const itemId = stringOrNull(item.id);
  if (item.type === "agentMessage") {
    return phase === "completed"
      ? [{ type: "assistant.completed", providerSessionId: threadId, turnId, itemId, payload: { text: String(item.text ?? "") } }]
      : [];
  }
  if (item.type === "plan") {
    return [{ type: "plan.updated", providerSessionId: threadId, turnId, itemId, payload: { text: String(item.text ?? ""), completed: phase === "completed" } }];
  }
  if (item.type === "reasoning") {
    return (Array.isArray(item.summary) ? item.summary : []).map((summary, index) => ({
      type: "reasoning.summary.delta",
      providerSessionId: threadId,
      turnId,
      itemId,
      payload: { delta: String(summary), summaryIndex: index, completed: phase === "completed" },
    }));
  }
  if (item.type === "fileChange") {
    const changes = summarizeFileChanges(item.changes);
    return [
      { type: phase === "started" ? "tool.started" : "tool.completed", providerSessionId: threadId, turnId, itemId, payload: { kind: "file-change", status: normalizeToolStatus(item.status, phase) } },
      { type: "file.change.updated", providerSessionId: threadId, turnId, itemId, payload: { changes, status: normalizeToolStatus(item.status, phase) } },
    ];
  }
  const tool = summarizeToolItem(item, phase);
  return tool ? [{ type: phase === "started" ? "tool.started" : "tool.completed", providerSessionId: threadId, turnId, itemId, payload: tool }] : [];
}

function summarizeToolItem(item, phase) {
  if (item.type === "commandExecution") {
    return boundRendererValue({
      kind: "command",
      label: item.command || "Command",
      command: item.command || "",
      cwd: item.cwd || null,
      status: normalizeToolStatus(item.status, phase),
      exitCode: Number.isInteger(item.exitCode) ? item.exitCode : null,
      durationMs: Number.isFinite(item.durationMs) ? item.durationMs : null,
      ...(phase === "completed" && item.aggregatedOutput ? { outputPreview: String(item.aggregatedOutput).slice(-16 * 1024) } : {}),
    });
  }
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return boundRendererValue(redactSecrets({
      kind: item.type === "mcpToolCall" ? "mcp" : "tool",
      label: item.type === "mcpToolCall" ? `${item.server}.${item.tool}` : item.tool,
      status: normalizeToolStatus(item.status, phase),
      arguments: item.arguments ?? null,
      durationMs: Number.isFinite(item.durationMs) ? item.durationMs : null,
    }));
  }
  if (item.type === "webSearch") return { kind: "search", label: item.query || "Web search", status: phase === "completed" ? "completed" : "running" };
  if (item.type === "imageView") return { kind: "read", label: `Viewed ${item.path || "image"}`, status: phase === "completed" ? "completed" : "running" };
  if (item.type === "contextCompaction") return { kind: "system", label: "Compacted context", status: phase === "completed" ? "completed" : "running" };
  return null;
}

function summarizeFileChanges(changes) {
  if (!Array.isArray(changes)) return [];
  return changes.slice(0, 100).map((change) => {
    const diff = typeof change?.diff === "string" ? change.diff : "";
    const lines = diff.split("\n");
    return {
      path: typeof change?.path === "string" ? change.path : "Unknown file",
      kind: typeof change?.kind === "string" ? change.kind : "update",
      additions: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
      deletions: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
    };
  });
}

function normalizePlan(plan) {
  if (!Array.isArray(plan)) return [];
  return plan.slice(0, 100).map((entry) => ({
    step: String(entry?.step ?? ""),
    status: ["pending", "inProgress", "completed"].includes(entry?.status) ? entry.status : String(entry?.status ?? "pending"),
  }));
}

function normalizeTurnStatus(status) {
  if (status === "interrupted") return "interrupted";
  if (status === "failed") return "failed";
  if (status === "inProgress") return "running";
  return "completed";
}

function normalizeToolStatus(status, phase) {
  if (status === "inProgress" || phase === "started") return "running";
  if (status === "declined") return "declined";
  if (status === "failed") return "failed";
  return "completed";
}

function normalizeProviderSession(result) {
  return {
    providerSessionId: result.thread.id,
    title: result.thread.name || result.thread.preview || "Codex session",
    model: result.model || null,
    createdAt: toIsoFromSeconds(result.thread.createdAt),
    updatedAt: toIsoFromSeconds(result.thread.updatedAt),
  };
}

function normalizeAccount(result) {
  const account = result?.account;
  if (!account || typeof account !== "object") {
    return { account: null, requiresOpenaiAuth: Boolean(result?.requiresOpenaiAuth) };
  }
  return {
    account: {
      type: typeof account.type === "string" ? account.type : "unknown",
      email: typeof account.email === "string" ? account.email : null,
      planType: typeof account.planType === "string" ? account.planType : null,
    },
    requiresOpenaiAuth: Boolean(result?.requiresOpenaiAuth),
  };
}

function normalizeModels(result) {
  if (!Array.isArray(result?.data)) return [];
  return result.data.filter((model) => !model?.hidden).slice(0, 100).map((model) => {
    const variants = Array.isArray(model?.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts
        .map((entry) => typeof entry?.reasoningEffort === "string" ? entry.reasoningEffort.trim() : "")
        .filter(Boolean)
        .slice(0, 20)
      : [];
    const advertisedDefault = typeof model?.defaultReasoningEffort === "string"
      ? model.defaultReasoningEffort.trim()
      : "";
    return {
      id: String(model.id ?? model.model ?? ""),
      model: String(model.model ?? model.id ?? ""),
      displayName: String(model.displayName ?? model.model ?? model.id ?? "Codex"),
      description: String(model.description ?? ""),
      isDefault: Boolean(model.isDefault),
      variants,
      defaultVariant: variants.includes(advertisedDefault)
        ? advertisedDefault
        : variants.includes("medium")
          ? "medium"
          : variants[0] ?? null,
    };
  }).filter((model) => model.id);
}

function compatibleReasoningEffort(model) {
  if (!model || !Array.isArray(model.variants) || model.variants.length === 0) return null;
  if (model.defaultVariant && model.variants.includes(model.defaultVariant)) return model.defaultVariant;
  return model.variants.includes("medium") ? "medium" : model.variants[0] ?? null;
}

function formatCodexErrorMessage(value, fallback = "Codex reported an error.") {
  return redactSecretText(extractCodexErrorText(value) || fallback);
}

function extractCodexErrorText(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        const nested = extractCodexErrorText(JSON.parse(text), depth + 1);
        if (nested) return nested;
      } catch {
        // Keep the bounded provider text when it only resembles JSON.
      }
    }
    return text.slice(0, 32_768);
  }
  if (typeof value !== "object" || Array.isArray(value)) return "";
  return extractCodexErrorText(value.error?.message, depth + 1)
    || extractCodexErrorText(value.message, depth + 1)
    || extractCodexErrorText(value.error, depth + 1);
}

function isApprovalDecision(value) {
  return ["accept", "acceptForSession", "decline", "cancel"].includes(value);
}

function normalizeNetworkApprovalContext(value) {
  if (!value || typeof value !== "object") return null;
  const host = typeof value.host === "string" ? value.host.trim() : "";
  const protocol = typeof value.protocol === "string" ? value.protocol.trim() : "";
  if (!host || !protocol) return null;
  return { host: host.slice(0, 512), protocol: protocol.slice(0, 40) };
}

function formatProviderWarning(params) {
  const summary = typeof params?.message === "string"
    ? params.message
    : typeof params?.summary === "string"
      ? params.summary
      : "Codex warning";
  const details = typeof params?.details === "string" ? params.details : null;
  const warningPath = typeof params?.path === "string" ? params.path : null;
  return redactSecretText([
    summary,
    details,
    warningPath ? `(${warningPath})` : null,
  ].filter(Boolean).join(" "));
}

function requireString(value, message) {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}

function stringOrNull(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toIsoFromSeconds(value) {
  return Number.isFinite(value) ? new Date(value * 1000).toISOString() : new Date().toISOString();
}

const TERMINAL_PART_STATUSES = new Set(["completed", "error"]);

export function createOpenCodeEventState({ runtimeName = "OpenCode" } = {}) {
  return {
    runtimeName,
    activeTurnId: null,
    interruptRequested: false,
    messageRoles: new Map(),
    partTypes: new Map(),
  };
}

export function normalizeOpenCodeEvent(envelope, state = createOpenCodeEventState()) {
  const event = envelope?.payload && typeof envelope.payload === "object" ? envelope.payload : envelope;
  if (!event || typeof event !== "object" || typeof event.type !== "string") return [];
  const properties = asRecord(event.properties);
  const sessionID = readString(properties.sessionID) || readString(properties.info?.id) || null;
  const turnId = state.activeTurnId;
  switch (event.type) {
    case "message.updated": {
      const info = asRecord(properties.info);
      const messageID = readString(info.id);
      const role = info.role === "user" ? "user" : info.role === "assistant" ? "assistant" : null;
      if (messageID && role) state.messageRoles.set(messageID, role);
      if (role !== "assistant") return [];
      const output = [];
      if (info.tokens && typeof info.tokens === "object") {
        output.push(agentEvent("usage.updated", sessionID, turnId, messageID, {
          cost: numberOrZero(info.cost),
          tokens: info.tokens,
          model: readString(info.modelID),
          provider: readString(info.providerID),
        }));
      }
      if (info.error) {
        output.push(agentEvent("provider.error", sessionID, turnId, messageID, {
          message: readErrorMessage(info.error) || `${state.runtimeName} assistant turn failed.`,
          errorName: readString(info.error?.name),
        }));
      }
      return output;
    }
    case "message.part.updated": {
      const part = asRecord(properties.part);
      const partID = readString(part.id);
      const messageID = readString(part.messageID);
      if (partID && part.type) state.partTypes.set(partID, readString(part.type));
      const role = state.messageRoles.get(messageID);
      return normalizeUpdatedPart(part, { sessionID, turnId, role, runtimeName: state.runtimeName });
    }
    case "message.part.delta": {
      const partID = readString(properties.partID);
      const messageID = readString(properties.messageID);
      const partType = state.partTypes.get(partID);
      const role = state.messageRoles.get(messageID);
      if (properties.field !== "text" || (partType !== "reasoning" && role !== "assistant")) return [];
      if (partType === "reasoning") {
        return [agentEvent("reasoning.summary.delta", sessionID, turnId, partID, {
          delta: readString(properties.delta),
          completed: false,
        })];
      }
      if (partType === "text" || !partType) {
        return [agentEvent("assistant.delta", sessionID, turnId, partID, { delta: readString(properties.delta) })];
      }
      return [];
    }
    case "session.next.text.delta":
      return [agentEvent("assistant.delta", sessionID, turnId, readString(properties.textID), {
        delta: readString(properties.delta),
      })];
    case "session.next.text.ended":
      return [agentEvent("assistant.completed", sessionID, turnId, readString(properties.textID), {
        text: readString(properties.text),
      })];
    case "session.next.reasoning.delta":
      return [agentEvent("reasoning.summary.delta", sessionID, turnId, readString(properties.reasoningID), {
        delta: readString(properties.delta),
        completed: false,
      })];
    case "session.next.reasoning.ended":
      return [agentEvent("reasoning.summary.delta", sessionID, turnId, readString(properties.reasoningID), {
        text: readString(properties.text),
        authoritative: true,
        completed: true,
      })];
    case "session.next.tool.called":
      return [agentEvent("tool.started", sessionID, turnId, readString(properties.callID), {
        kind: toolKind(properties.tool),
        tool: readString(properties.tool),
        label: readString(properties.tool) || "Tool",
        status: "running",
        input: properties.input,
      })];
    case "session.next.tool.progress":
      return [agentEvent("tool.progress", sessionID, turnId, readString(properties.callID), {
        status: "running",
        detail: properties.structured,
        content: properties.content,
      })];
    case "session.next.tool.success":
      return [agentEvent("tool.completed", sessionID, turnId, readString(properties.callID), {
        status: "completed",
        detail: properties.structured,
        content: properties.content,
        outputPaths: properties.outputPaths,
      })];
    case "session.next.tool.failed":
      return [agentEvent("tool.completed", sessionID, turnId, readString(properties.callID), {
        status: "failed",
        error: readErrorMessage(properties.error) || "Tool execution failed.",
      })];
    case "session.next.step.ended":
      return [agentEvent("usage.updated", sessionID, turnId, readString(properties.assistantMessageID), {
        cost: numberOrZero(properties.cost),
        tokens: properties.tokens,
        finish: readString(properties.finish),
      })];
    case "todo.updated":
      return [agentEvent("plan.updated", sessionID, turnId, "current-plan", {
        steps: normalizeTodos(properties.todos),
        completed: normalizeTodos(properties.todos).every((item) => item.status === "completed"),
      })];
    case "session.diff":
      return [agentEvent("file.change.updated", sessionID, turnId, "session-diff", {
        status: "completed",
        changes: normalizeDiff(properties.diff),
      })];
    case "permission.asked":
    case "permission.v2.asked":
      return [normalizePermission(properties, sessionID, turnId)];
    case "permission.replied":
    case "permission.v2.replied":
      return [agentEvent("approval.resolved", sessionID, turnId, readString(properties.requestID), {
        requestId: readString(properties.requestID),
        decision: normalizePermissionReply(properties.reply),
        reason: "runtime-resolved",
      })];
    case "question.asked":
    case "question.v2.asked":
      return [agentEvent("question.requested", sessionID, turnId, properties.tool?.callID ?? properties.id, {
        requestId: readString(properties.id),
        questions: normalizeQuestions(properties.questions),
      })];
    case "question.replied":
    case "question.v2.replied":
      return [agentEvent("question.resolved", sessionID, turnId, readString(properties.requestID), {
        requestId: readString(properties.requestID),
        answers: properties.answers,
        resolution: "answered",
      })];
    case "question.rejected":
    case "question.v2.rejected":
      return [agentEvent("question.resolved", sessionID, turnId, readString(properties.requestID), {
        requestId: readString(properties.requestID),
        resolution: "rejected",
      })];
    case "session.status": {
      const status = asRecord(properties.status);
      if (status.type === "retry") {
        return [agentEvent("provider.warning", sessionID, turnId, null, {
          message: readString(status.message) || `${state.runtimeName} is retrying the provider request.`,
          attempt: numberOrZero(status.attempt),
          next: status.next,
        })];
      }
      if (status.type !== "idle") return [];
      return finishTurn(state, sessionID);
    }
    case "session.idle":
      return finishTurn(state, sessionID);
    case "session.error": {
      const failedTurn = state.activeTurnId;
      state.activeTurnId = null;
      const message = readErrorMessage(properties.error) || `${state.runtimeName} session failed.`;
      return [
        ...(failedTurn ? [agentEvent("turn.failed", sessionID, failedTurn, null, { status: "failed", message })] : []),
        agentEvent("provider.error", sessionID, failedTurn, null, { message }),
      ];
    }
    case "session.compacted":
    case "session.next.compaction.ended":
      return [agentEvent("provider.activity", sessionID, turnId, readString(properties.messageID) || null, {
        activityType: "compaction",
        label: "Context compacted",
        status: "completed",
      })];
    case "session.updated": {
      const info = asRecord(properties.info);
      return readString(info.title)
        ? [agentEvent("session.updated", sessionID, turnId, null, { title: readString(info.title) })]
        : [];
    }
    default:
      return isInterestingUnknown(event.type)
        ? [agentEvent("provider.activity", sessionID, turnId, null, {
          activityType: event.type,
          label: humanizeEventType(event.type),
          status: "completed",
        })]
        : [];
  }
}

export function normalizeOpenCodeHistory(messages, { runtimeName = "OpenCode" } = {}) {
  const entries = Array.isArray(messages) ? messages : [];
  const output = [];
  let pendingTerminal = null;
  const flushTerminal = () => {
    if (!pendingTerminal) return;
    const { sessionID, turnId, info } = pendingTerminal;
    const failed = Boolean(info.error);
    output.push(agentEvent(failed ? "turn.failed" : "turn.completed", sessionID, turnId, null, {
      status: failed ? "failed" : "completed",
      ...(failed ? { message: readErrorMessage(info.error) || `${runtimeName} turn failed.` } : {}),
    }));
    pendingTerminal = null;
  };
  for (const entry of entries) {
    const info = asRecord(entry?.info);
    const parts = Array.isArray(entry?.parts) ? entry.parts : [];
    const sessionID = readString(info.sessionID);
    const messageID = readString(info.id);
    if (info.role === "user") {
      flushTerminal();
      const prompt = parts.filter((part) => part?.type === "text").map((part) => readString(part.text)).join("\n").trim();
      if (prompt) output.push(agentEvent("turn.started", sessionID, messageID, null, { prompt, model: formatMessageModel(info) }));
      continue;
    }
    if (info.role !== "assistant") continue;
    const turnId = readString(info.parentID) || messageID;
    if (pendingTerminal && pendingTerminal.turnId !== turnId) flushTerminal();
    for (const part of parts) {
      output.push(...normalizeHistoricalPart(asRecord(part), { sessionID, turnId, runtimeName }));
    }
    if (info.tokens && typeof info.tokens === "object") {
      output.push(agentEvent("usage.updated", sessionID, turnId, messageID, {
        tokens: info.tokens,
        cost: numberOrZero(info.cost),
        model: readString(info.modelID),
        provider: readString(info.providerID),
      }));
    }
    pendingTerminal = { sessionID, turnId, info };
  }
  flushTerminal();
  return output;
}

export function normalizeOpenCodeActiveTurnHistory(messages, turnId, { runtimeName = "OpenCode" } = {}) {
  if (!turnId || !Array.isArray(messages)) return [];
  const lastUserIndex = messages.findLastIndex((entry) => entry?.info?.role === "user");
  if (lastUserIndex < 0) return [];
  const userID = readString(messages[lastUserIndex]?.info?.id);
  const output = [];
  for (const entry of messages.slice(lastUserIndex + 1)) {
    const info = asRecord(entry?.info);
    if (info.role !== "assistant" || (userID && readString(info.parentID) && readString(info.parentID) !== userID)) continue;
    for (const part of Array.isArray(entry?.parts) ? entry.parts : []) {
      output.push(...normalizeHistoricalPart(asRecord(part), {
        sessionID: readString(info.sessionID),
        turnId,
        runtimeName,
      }));
    }
    if (info.tokens && typeof info.tokens === "object") {
      output.push(agentEvent("usage.updated", readString(info.sessionID), turnId, readString(info.id), {
        tokens: info.tokens,
        cost: numberOrZero(info.cost),
        model: readString(info.modelID),
        provider: readString(info.providerID),
      }));
    }
  }
  return output;
}

function normalizeUpdatedPart(part, { sessionID, turnId, role, runtimeName = "OpenCode" }) {
  const partID = readString(part.id);
  if (part.type === "text") {
    if (role !== "assistant" || part.ignored) return [];
    if (part.time?.end || readString(part.text)) {
      return [agentEvent("assistant.completed", sessionID, turnId, partID, { text: readString(part.text) })];
    }
    return [];
  }
  if (part.type === "reasoning") {
    return [agentEvent("reasoning.summary.delta", sessionID, turnId, partID, {
      text: readString(part.text),
      authoritative: true,
      completed: Boolean(part.time?.end),
    })];
  }
  if (part.type === "tool") {
    const state = asRecord(part.state);
    const terminal = TERMINAL_PART_STATUSES.has(readString(state.status));
    return [agentEvent(terminal ? "tool.completed" : state.status === "pending" ? "tool.started" : "tool.progress", sessionID, turnId, readString(part.callID) || partID, {
      kind: toolKind(part.tool),
      tool: readString(part.tool),
      label: readString(state.title) || humanizeTool(part.tool),
      status: state.status === "error" ? "failed" : readString(state.status) || "running",
      input: state.input,
      outputPreview: readString(state.output),
      error: readString(state.error),
      metadata: state.metadata,
    })];
  }
  if (part.type === "patch") {
    return [agentEvent("file.change.updated", sessionID, turnId, partID, {
      status: "completed",
      changes: Array.isArray(part.files) ? part.files.map((file) => ({ path: String(file), kind: "update" })) : [],
    })];
  }
  if (part.type === "step-finish") {
    return [agentEvent("usage.updated", sessionID, turnId, partID, {
      cost: numberOrZero(part.cost),
      tokens: part.tokens,
      finish: readString(part.reason),
    })];
  }
  if (part.type === "retry") {
    return [agentEvent("provider.warning", sessionID, turnId, partID, {
      message: readErrorMessage(part.error) || `${runtimeName} is retrying.`,
      attempt: numberOrZero(part.attempt),
    })];
  }
  if (part.type === "compaction") {
    return [agentEvent("provider.activity", sessionID, turnId, partID, {
      activityType: "compaction",
      label: "Context compacted",
      status: "completed",
    })];
  }
  return [];
}

function normalizeHistoricalPart(part, context) {
  if (part.type === "text" && !part.ignored) {
    return [agentEvent("assistant.completed", context.sessionID, context.turnId, readString(part.id), { text: readString(part.text) })];
  }
  return normalizeUpdatedPart(part, { ...context, role: "assistant" });
}

function normalizePermission(properties, sessionID, turnId) {
  const requestId = readString(properties.id);
  const permission = readString(properties.permission) || readString(properties.action) || "tool";
  const metadata = asRecord(properties.metadata);
  const durable = Array.isArray(properties.always) && properties.always.length > 0
    || Array.isArray(properties.save) && properties.save.length > 0;
  return agentEvent("approval.requested", sessionID, turnId, properties.tool?.callID ?? requestId, {
    requestId,
    kind: permission === "edit" || permission === "write" ? "file-change" : "command",
    title: permissionTitle(permission),
    command: readString(metadata.command) || null,
    cwd: readString(metadata.cwd) || null,
    grantRoot: readString(metadata.filepath) || readString(metadata.path) || null,
    reason: readString(metadata.description) || null,
    patterns: properties.patterns ?? properties.resources ?? [],
    availableDecisions: durable
      ? ["accept", "acceptForSession", "decline", "cancel"]
      : ["accept", "decline", "cancel"],
  });
}

function finishTurn(state, sessionID) {
  const active = state.activeTurnId;
  if (!active) return [];
  const interrupted = state.interruptRequested;
  state.activeTurnId = null;
  state.interruptRequested = false;
  return [agentEvent(interrupted ? "turn.interrupted" : "turn.completed", sessionID, active, null, {
    status: interrupted ? "interrupted" : "completed",
  })];
}

function agentEvent(type, providerSessionId, turnId, itemId, payload) {
  return {
    type,
    providerSessionId: providerSessionId || null,
    turnId: turnId || null,
    itemId: itemId || null,
    payload: asRecord(payload),
  };
}

function normalizeQuestions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((question) => ({
    header: readString(question?.header).slice(0, 80),
    question: readString(question?.question).slice(0, 4_000),
    multiple: Boolean(question?.multiple),
    custom: question?.custom !== false,
    options: Array.isArray(question?.options) ? question.options.slice(0, 20).map((option) => ({
      label: readString(option?.label).slice(0, 120),
      description: readString(option?.description).slice(0, 1_000),
    })) : [],
  }));
}

function normalizeTodos(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((todo) => ({
    step: readString(todo?.content),
    status: readString(todo?.status).replace("in_progress", "inProgress") || "pending",
    priority: readString(todo?.priority),
  }));
}

function normalizeDiff(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((diff) => {
    const path = readString(diff?.file) || readString(diff?.path);
    return path ? [{
      path,
      additions: numberOrZero(diff?.additions),
      deletions: numberOrZero(diff?.deletions),
      status: readString(diff?.status),
    }] : [];
  });
}

function normalizePermissionReply(reply) {
  if (reply === "once") return "accept";
  if (reply === "always") return "acceptForSession";
  return "decline";
}

function permissionTitle(permission) {
  if (permission === "edit" || permission === "write") return "Allow file changes";
  if (permission === "bash" || permission === "command") return "Allow command";
  if (permission === "webfetch" || permission === "websearch") return "Allow network access";
  if (permission === "external_directory") return "Allow external directory access";
  return `Allow ${humanizeTool(permission)}`;
}

function toolKind(tool) {
  const normalized = readString(tool).toLowerCase();
  if (normalized === "bash" || normalized.includes("command") || normalized === "shell") return "command";
  if (["edit", "write", "apply_patch", "patch"].includes(normalized)) return "file-change";
  return "tool";
}

function humanizeTool(tool) {
  const text = readString(tool).replace(/[_-]+/g, " ").trim();
  return text ? text.replace(/\b\w/g, (character) => character.toUpperCase()) : "Tool";
}

function formatMessageModel(info) {
  const provider = readString(info.model?.providerID) || readString(info.providerID);
  const model = readString(info.model?.modelID) || readString(info.modelID);
  return provider && model ? `${provider}/${model}` : model || null;
}

function readErrorMessage(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (typeof value.message === "string") return value.message;
  if (value.data && typeof value.data === "object" && typeof value.data.message === "string") return value.data.message;
  if (value.error) return readErrorMessage(value.error);
  return "";
}

function isInterestingUnknown(type) {
  return type.startsWith("session.next.") || type === "mcp.tools.changed" || type === "command.executed";
}

function humanizeEventType(type) {
  return type.split(".").slice(-2).join(" ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readString(value) {
  return typeof value === "string" ? value : "";
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

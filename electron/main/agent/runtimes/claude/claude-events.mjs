import { boundRendererValue, redactSecrets, redactSecretText } from "../../agent-events.mjs";

export function createClaudeEventState({ turnId = null, resumed = false } = {}) {
  return {
    turnId,
    resumed,
    lifecycleEmitted: false,
    streamedText: new Set(),
    startedTools: new Set(),
    terminal: false,
  };
}

export function normalizeClaudeMessage(message, state = createClaudeEventState()) {
  if (!message || typeof message !== "object") return [];
  const sessionId = safeId(message.session_id);
  const turnId = state.turnId;
  if (message.type === "system" && message.subtype === "init") {
    if (state.lifecycleEmitted) return [];
    state.lifecycleEmitted = true;
    return [event(state.resumed ? "session.resumed" : "session.started", sessionId, turnId, null, {
      title: state.resumed ? "Claude Code session" : "New Claude Code session",
      model: text(message.model),
      permissionMode: text(message.permissionMode),
      version: text(message.claude_code_version),
    })];
  }
  if (message.type === "stream_event") return normalizeStreamEvent(message, state, sessionId);
  if (message.type === "assistant") return normalizeAssistant(message, state, sessionId);
  if (message.type === "user") return normalizeToolResults(message, state, sessionId);
  if (message.type === "tool_progress") {
    return [event("tool.progress", sessionId, turnId, safeId(message.tool_use_id), {
      kind: toolKind(message.tool_name),
      label: toolLabel(message.tool_name, {}),
      status: "running",
      elapsedMs: Math.max(0, Number(message.elapsed_time_seconds) || 0) * 1_000,
    })];
  }
  if (message.type === "result") return normalizeResult(message, state, sessionId);
  if (message.type === "system" && message.subtype === "api_retry") {
    return [event("provider.warning", sessionId, turnId, null, {
      message: redactSecretText(message.error || "Claude Code is retrying the provider request."),
      attempt: Number(message.attempt) || 0,
      maxRetries: Number(message.max_retries) || 0,
      retryDelayMs: Number(message.retry_delay_ms) || 0,
    })];
  }
  if (message.type === "system" && message.subtype === "permission_denied") {
    return [event("tool.completed", sessionId, turnId, safeId(message.tool_use_id), {
      kind: toolKind(message.tool_name),
      label: toolLabel(message.tool_name, {}),
      status: "declined",
      error: redactSecretText(message.decision_reason || "Permission denied."),
    })];
  }
  if (message.type === "system" && message.subtype === "files_persisted") {
    return [event("file.change.updated", sessionId, turnId, "claude:files", {
      status: message.failed?.length ? "failed" : "completed",
      changes: [...asArray(message.files), ...asArray(message.failed)].slice(0, 200).map((file) => ({
        path: text(file?.filename).slice(0, 4_096),
        status: file?.error ? "failed" : "updated",
      })).filter((change) => change.path),
    })];
  }
  if (message.type === "system" && message.subtype === "local_command_output" && text(message.content)) {
    return [event("assistant.completed", sessionId, turnId, safeId(message.uuid), { text: text(message.content) })];
  }
  if (message.type === "auth_status") {
    return [event(message.error ? "provider.error" : "provider.activity", sessionId, turnId, null, {
      message: redactSecretText(message.error || asArray(message.output).join("\n") || "Claude Code authentication is in progress."),
      status: message.isAuthenticating ? "running" : "completed",
    })];
  }
  return [];
}

export function normalizeClaudeHistory(messages, providerSessionId) {
  const events = [];
  let turnId = null;
  let state = null;
  const finish = () => {
    if (!turnId) return;
    events.push(event("turn.completed", providerSessionId, turnId, null, { status: "completed", historical: true }));
    turnId = null;
    state = null;
  };
  for (const message of asArray(messages)) {
    const content = asArray(message?.message?.content);
    const humanText = message?.type === "user" && !content.some((block) => block?.type === "tool_result")
      ? content.filter((block) => block?.type === "text").map((block) => text(block.text)).join("\n")
      : "";
    if (humanText) {
      finish();
      turnId = `claude:history:${safeId(message.uuid) || events.length + 1}`;
      state = createClaudeEventState({ turnId, resumed: true });
      events.push(event("turn.started", providerSessionId, turnId, null, { status: "running", prompt: humanText, historical: true }));
      continue;
    }
    if (!turnId) {
      turnId = `claude:history:${safeId(message?.uuid) || events.length + 1}`;
      state = createClaudeEventState({ turnId, resumed: true });
      events.push(event("turn.started", providerSessionId, turnId, null, { status: "running", historical: true }));
    }
    events.push(...normalizeClaudeMessage({ ...message, session_id: providerSessionId }, state));
  }
  finish();
  return events;
}

function normalizeStreamEvent(message, state, sessionId) {
  const native = message.event ?? {};
  const itemId = safeId(message.uuid) || `claude:assistant:${state.turnId}`;
  if (native.type === "content_block_delta" && native.delta?.type === "text_delta") {
    state.streamedText.add(itemId);
    return [event("assistant.delta", sessionId, state.turnId, itemId, { delta: text(native.delta.text) })];
  }
  if (native.type === "content_block_delta" && native.delta?.type === "thinking_delta") {
    return [event("reasoning.summary.delta", sessionId, state.turnId, itemId, { delta: text(native.delta.thinking) })];
  }
  if (native.type === "content_block_start" && native.content_block?.type === "tool_use") {
    return startTool(native.content_block, state, sessionId);
  }
  if (native.type === "message_delta" && native.usage) {
    return [event("usage.updated", sessionId, state.turnId, null, boundRendererValue(native.usage))];
  }
  return [];
}

function normalizeAssistant(message, state, sessionId) {
  const result = [];
  const itemId = safeId(message.uuid) || `claude:assistant:${state.turnId}`;
  for (const block of asArray(message.message?.content)) {
    if (block?.type === "text" && text(block.text)) {
      result.push(event("assistant.completed", sessionId, state.turnId, itemId, { text: text(block.text) }));
    } else if (block?.type === "thinking" && text(block.thinking)) {
      result.push(event("reasoning.summary.delta", sessionId, state.turnId, itemId, { delta: text(block.thinking), completed: true }));
    } else if (block?.type === "tool_use") {
      result.push(...startTool(block, state, sessionId));
    }
  }
  if (message.error) {
    result.push(event("provider.error", sessionId, state.turnId, itemId, {
      message: redactSecretText(`Claude Code assistant error: ${message.error}`),
      recoverable: true,
    }));
  }
  return result;
}

function startTool(block, state, sessionId) {
  const toolId = safeId(block.id) || `claude:tool:${state.startedTools.size + 1}`;
  if (state.startedTools.has(toolId)) return [];
  state.startedTools.add(toolId);
  return [event("tool.started", sessionId, state.turnId, toolId, toolPayload(block.name, block.input, "running"))];
}

function normalizeToolResults(message, state, sessionId) {
  return asArray(message.message?.content).flatMap((block) => {
    if (block?.type !== "tool_result") return [];
    const output = typeof block.content === "string"
      ? block.content
      : asArray(block.content).filter((part) => part?.type === "text").map((part) => text(part.text)).join("\n");
    return [event("tool.completed", sessionId, state.turnId, safeId(block.tool_use_id), {
      kind: "tool",
      label: "Tool",
      status: block.is_error ? "failed" : "completed",
      outputPreview: redactSecretText(output).slice(-16 * 1024),
    })];
  });
}

function normalizeResult(message, state, sessionId) {
  if (state.terminal) return [];
  state.terminal = true;
  const result = [];
  if (message.usage) {
    result.push(event("usage.updated", sessionId, state.turnId, null, boundRendererValue({
      ...message.usage,
      totalCostUsd: Number(message.total_cost_usd) || 0,
      durationMs: Number(message.duration_ms) || 0,
      modelUsage: message.modelUsage ?? {},
    })));
  }
  const failed = message.subtype !== "success" || message.is_error === true;
  if (failed) {
    const errorMessage = asArray(message.errors).map(text).filter(Boolean).join("\n") || "Claude Code turn failed.";
    result.push(event("provider.error", sessionId, state.turnId, null, { message: redactSecretText(errorMessage), recoverable: true }));
  }
  result.push(event(failed ? "turn.failed" : "turn.completed", sessionId, state.turnId, null, {
    status: failed ? "failed" : "completed",
    stopReason: text(message.stop_reason) || null,
    numTurns: Number(message.num_turns) || 0,
  }));
  return result;
}

function toolPayload(name, input, status) {
  const safeInput = boundRendererValue(redactSecrets(input ?? {}));
  return {
    kind: toolKind(name),
    label: toolLabel(name, safeInput),
    status,
    arguments: safeInput,
    path: text(safeInput.file_path || safeInput.path) || null,
    command: text(safeInput.command) || null,
  };
}

function toolKind(name) {
  const normalized = text(name).toLowerCase();
  if (normalized === "bash") return "command";
  if (["read", "glob", "grep"].includes(normalized)) return normalized === "read" ? "read" : "search";
  if (["write", "edit", "multiedit", "notebookedit"].includes(normalized)) return "file-change";
  if (normalized.includes("web")) return "network";
  return "tool";
}

function toolLabel(name, input) {
  if (name === "Bash") return text(input?.description) || text(input?.command).slice(0, 240) || "Run command";
  const path = text(input?.file_path || input?.path);
  return path ? `${name || "Tool"} ${path}` : text(name) || "Tool";
}

function event(type, providerSessionId, turnId, itemId, payload) {
  return { type, providerSessionId: safeId(providerSessionId), turnId: safeId(turnId), itemId: safeId(itemId), payload: payload ?? {} };
}

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9:._-]{1,256}$/.test(value) ? value : null;
}

function text(value) {
  return typeof value === "string" ? value.slice(0, 32_768) : "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

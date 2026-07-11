export const AGENT_EVENT_TYPES = Object.freeze([
  "session.started", "session.resumed", "session.updated", "session.closed",
  "turn.started", "turn.completed", "turn.failed", "turn.interrupted",
  "assistant.delta", "assistant.completed", "reasoning.summary.delta", "plan.updated",
  "tool.started", "tool.progress", "tool.completed", "command.output.delta",
  "file.change.updated", "usage.updated", "approval.requested", "approval.resolved",
  "question.requested", "question.resolved", "provider.activity", "provider.warning", "provider.error",
]);

export const AGENT_RUNTIME_CAPABILITIES = Object.freeze([
  "streamingText", "structuredToolEvents", "commandOutputStreaming", "fileChangeEvents",
  "manualApprovals", "structuredQuestions", "resume", "fork", "steer", "queue",
  "attachments", "contextReferences", "modelSelection", "modeSelection", "slashCommands",
  "sessionHistory", "usage", "accountState", "mcp", "skills", "compaction",
]);

export const REQUIRED_AGENT_RUNTIME_METHODS = Object.freeze([
  "inspect", "createSession", "resumeSession", "readHistory", "startTurn", "interruptTurn", "dispose",
]);

export const AGENT_IPC_CHANNELS = Object.freeze([
  "agent:providers-discover", "agent:models-list", "agent:account-read",
  "agent:session-create", "agent:session-resume", "agent:session-replay", "agent:sessions-list",
  "agent:session-fork", "agent:session-archive", "agent:session-delete", "agent:session-close",
  "agent:turn-start", "agent:turn-steer", "agent:turn-interrupt", "agent:session-compact",
  "agent:approval-resolve", "agent:question-resolve",
]);

export const agentContractLimits = Object.freeze({
  maxPathLength: 4_096,
  maxMessageLength: 128 * 1024,
  maxReferenceCount: 32,
});

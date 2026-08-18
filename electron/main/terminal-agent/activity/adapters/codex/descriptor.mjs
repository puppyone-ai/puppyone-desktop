import { createPhaseResolver, DEFAULT_TOOL_GROUPS, normalizeProjectedToolEvent } from "../normalize-tool-event.mjs";

const phaseFor = createPhaseResolver({
  PreToolUse: "started",
  PostToolUse: "completed",
});

export const codexActivityAdapter = Object.freeze({
  providerId: "codex",
  displayName: "Codex",
  registrationKind: "json-hooks",
  normalize(payload, context) {
    if (String(payload.eventName).toLowerCase() === "sessionend") {
      return sourceSessionEnded(payload);
    }
    return normalizeProjectedToolEvent({
      payload,
      providerId: "codex",
      terminalSessionId: context.terminalSessionId,
      phase: phaseFor(payload.eventName),
      toolGroups: DEFAULT_TOOL_GROUPS,
      occurredAt: context.occurredAt,
    });
  },
});

function sourceSessionEnded(payload) {
  return Object.freeze({ kind: "source-session-ended", sourceSessionId: payload.sessionId ?? null });
}

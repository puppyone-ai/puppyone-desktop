import { createPhaseResolver, DEFAULT_TOOL_GROUPS, normalizeProjectedToolEvent } from "../normalize-tool-event.mjs";

const phaseFor = createPhaseResolver({
  PreToolUse: "started",
  PostToolUse: "completed",
  PostToolUseFailure: "failed",
});

export const claudeActivityAdapter = Object.freeze({
  providerId: "claude",
  displayName: "Claude Code",
  registrationKind: "json-hooks",
  normalize(payload, context) {
    if (String(payload.eventName).toLowerCase() === "sessionend") {
      return Object.freeze({ kind: "source-session-ended", sourceSessionId: payload.sessionId ?? null });
    }
    return normalizeProjectedToolEvent({
      payload,
      providerId: "claude",
      terminalSessionId: context.terminalSessionId,
      phase: phaseFor(payload.eventName),
      toolGroups: DEFAULT_TOOL_GROUPS,
      occurredAt: context.occurredAt,
    });
  },
});

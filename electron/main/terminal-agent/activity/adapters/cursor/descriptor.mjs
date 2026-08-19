import { createPhaseResolver, DEFAULT_TOOL_GROUPS, normalizeProjectedToolEvent } from "../normalize-tool-event.mjs";

const phaseFor = createPhaseResolver({
  preToolUse: "started",
  postToolUse: "completed",
  postToolUseFailure: "failed",
  beforeReadFile: "started",
  afterFileEdit: "completed",
});

export const cursorActivityAdapter = Object.freeze({
  providerId: "cursor",
  displayName: "Cursor Agent CLI",
  registrationKind: "cursor-json-hooks",
  normalize(payload, context) {
    if (String(payload.eventName).toLowerCase() === "sessionend") {
      return Object.freeze({ kind: "source-session-ended", sourceSessionId: payload.sessionId ?? null });
    }
    return normalizeProjectedToolEvent({
      payload,
      providerId: "cursor",
      terminalSessionId: context.terminalSessionId,
      phase: phaseFor(payload.eventName),
      toolGroups: DEFAULT_TOOL_GROUPS,
      occurredAt: context.occurredAt,
    });
  },
});

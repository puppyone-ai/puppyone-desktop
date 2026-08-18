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
  displayName: "Cursor Agent",
  registrationKind: "manual",
  normalize(payload, context) {
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

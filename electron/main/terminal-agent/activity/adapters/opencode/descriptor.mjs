import { createPhaseResolver, DEFAULT_TOOL_GROUPS, normalizeProjectedToolEvent } from "../normalize-tool-event.mjs";

const phaseFor = createPhaseResolver({
  "tool.execute.before": "started",
  "tool.execute.after": "completed",
  "tool.execute.error": "failed",
});

export const openCodeActivityAdapter = Object.freeze({
  providerId: "opencode",
  displayName: "OpenCode",
  registrationKind: "manual",
  normalize(payload, context) {
    return normalizeProjectedToolEvent({
      payload,
      providerId: "opencode",
      terminalSessionId: context.terminalSessionId,
      phase: phaseFor(payload.eventName),
      toolGroups: DEFAULT_TOOL_GROUPS,
      occurredAt: context.occurredAt,
    });
  },
});

import { createPhaseResolver, DEFAULT_TOOL_GROUPS, normalizeProjectedToolEvent } from "../normalize-tool-event.mjs";

const phaseFor = createPhaseResolver({
  tool_call: "started",
  tool_result: "completed",
  tool_error: "failed",
});

export const piActivityAdapter = Object.freeze({
  providerId: "pi",
  displayName: "Pi Agent",
  registrationKind: "manual",
  normalize(payload, context) {
    return normalizeProjectedToolEvent({
      payload,
      providerId: "pi",
      terminalSessionId: context.terminalSessionId,
      phase: phaseFor(payload.eventName),
      toolGroups: DEFAULT_TOOL_GROUPS,
      occurredAt: context.occurredAt,
    });
  },
});

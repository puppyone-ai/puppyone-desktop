import { createPhaseResolver, DEFAULT_TOOL_GROUPS, normalizeProjectedToolEvent } from "../normalize-tool-event.mjs";

const phaseFor = createPhaseResolver({
  pre_tool_call: "started",
  post_tool_call: "completed",
  tool_call_error: "failed",
});

export const hermesActivityAdapter = Object.freeze({
  providerId: "hermes",
  displayName: "Hermes Agent",
  registrationKind: "manual",
  normalize(payload, context) {
    if (/^on_session_(?:end|finalize)$/u.test(String(payload.eventName).toLowerCase())) {
      return Object.freeze({ kind: "source-session-ended", sourceSessionId: payload.sessionId ?? null });
    }
    return normalizeProjectedToolEvent({
      payload,
      providerId: "hermes",
      terminalSessionId: context.terminalSessionId,
      phase: phaseFor(payload.eventName),
      toolGroups: DEFAULT_TOOL_GROUPS,
      occurredAt: context.occurredAt,
    });
  },
});

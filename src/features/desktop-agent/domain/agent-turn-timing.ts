const MAX_TURN_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export function parseAgentEventTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function readAgentTurnDurationMs(value: unknown, startedAtMs: number | null, emittedAt: string) {
  const nativeDuration = Number(value);
  if (Number.isFinite(nativeDuration) && nativeDuration >= 0) {
    return Math.min(MAX_TURN_DURATION_MS, Math.round(nativeDuration));
  }
  const completedAtMs = parseAgentEventTime(emittedAt);
  if (startedAtMs === null || completedAtMs === null || completedAtMs < startedAtMs) return null;
  return Math.min(MAX_TURN_DURATION_MS, completedAtMs - startedAtMs);
}

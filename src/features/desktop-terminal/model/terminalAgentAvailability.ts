import {
  DESKTOP_TERMINAL_LAUNCHERS,
  type DesktopTerminalLauncherId,
} from "./terminalLaunchers";

export type AvailableTerminalAgentId = Exclude<DesktopTerminalLauncherId, "shell">;
export type TerminalAgentDiscoveryPhase = "idle" | "loading" | "ready" | "error";

export type TerminalAgentLocationSnapshot = {
  availableAgentIds: AvailableTerminalAgentId[];
  scannedAt: string;
  source: "scan" | "memory-cache";
};

export type TerminalAgentLocationProgressEvent = {
  availableAgentIds: AvailableTerminalAgentId[];
  completedAgentCount: number;
  requestId: string;
  totalAgentCount: number;
};

const stableAgentIds = DESKTOP_TERMINAL_LAUNCHERS
  .map(({ id }) => id)
  .filter((id): id is AvailableTerminalAgentId => id !== "shell");
const terminalAgentIdSet = new Set<string>(stableAgentIds);

/** Treat the native response as untrusted and restore stable catalog order. */
export function normalizeTerminalAgentLocationSnapshot(
  value: unknown,
): TerminalAgentLocationSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid Terminal Agent snapshot.");
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.availableAgentIds)) {
    throw new Error("Invalid Terminal Agent availability list.");
  }
  if (typeof candidate.scannedAt !== "string" || !Number.isFinite(Date.parse(candidate.scannedAt))) {
    throw new Error("Invalid Terminal Agent scan timestamp.");
  }
  if (candidate.source !== "scan" && candidate.source !== "memory-cache") {
    throw new Error("Invalid Terminal Agent snapshot source.");
  }
  return {
    availableAgentIds: normalizeAvailableTerminalAgentIds(candidate.availableAgentIds),
    scannedAt: candidate.scannedAt,
    source: candidate.source,
  };
}

/** Normalize an incremental native event without accepting paths or unknown ids. */
export function normalizeTerminalAgentLocationProgressEvent(
  value: unknown,
): TerminalAgentLocationProgressEvent {
  if (!value || typeof value !== "object") throw new Error("Invalid Terminal Agent progress event.");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.requestId !== "string" || !/^[A-Za-z0-9:_-]{1,96}$/u.test(candidate.requestId)) {
    throw new Error("Invalid Terminal Agent progress request id.");
  }
  if (!Array.isArray(candidate.availableAgentIds)) {
    throw new Error("Invalid Terminal Agent progress availability list.");
  }
  if (!Number.isInteger(candidate.totalAgentCount)
    || (candidate.totalAgentCount as number) < 0
    || (candidate.totalAgentCount as number) > stableAgentIds.length
    || !Number.isInteger(candidate.completedAgentCount)
    || (candidate.completedAgentCount as number) < 0
    || (candidate.completedAgentCount as number) > (candidate.totalAgentCount as number)) {
    throw new Error("Invalid Terminal Agent progress counts.");
  }
  return {
    availableAgentIds: normalizeAvailableTerminalAgentIds(candidate.availableAgentIds),
    completedAgentCount: candidate.completedAgentCount as number,
    requestId: candidate.requestId,
    totalAgentCount: candidate.totalAgentCount as number,
  };
}

export function normalizeAvailableTerminalAgentIds(
  values: readonly unknown[],
): AvailableTerminalAgentId[] {
  const available = new Set(
    values.filter(
      (id): id is AvailableTerminalAgentId => typeof id === "string" && terminalAgentIdSet.has(id),
    ),
  );
  return stableAgentIds.filter((id) => available.has(id));
}

export const TERMINAL_AGENT_PRIMARY_LIMIT = 6;

/** Keep the launcher quiet as the catalog grows, without encoding product ids in UI. */
export function partitionTerminalAgentLaunchers<T>(
  agents: readonly T[],
  primaryLimit = TERMINAL_AGENT_PRIMARY_LIMIT,
): { primary: T[]; overflow: T[] } {
  const safeLimit = Number.isInteger(primaryLimit) && primaryLimit >= 0
    ? primaryLimit
    : TERMINAL_AGENT_PRIMARY_LIMIT;
  return {
    primary: agents.slice(0, safeLimit),
    overflow: agents.slice(safeLimit),
  };
}

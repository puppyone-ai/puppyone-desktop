export const AGENT_ACTIVITY_SCHEMA_VERSION: 1;

export const AGENT_ACTIVITY_LIMITS: Readonly<{
  frameBytes: number;
  pathLength: number;
  providerIdLength: number;
  stringLength: number;
  targetsPerActivity: number;
  activeClaimsPerWindow: number;
  activeClaimLeaseMs: number;
  completedLingerMs: number;
}>;

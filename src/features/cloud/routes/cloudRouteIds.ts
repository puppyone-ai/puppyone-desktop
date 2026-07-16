export const CLOUD_WORKSPACE_SECTIONS = [
  "initialize",
  "overview",
  "templates",
  "cloud-team",
  "cloud-billing",
  "contents",
  "history",
  "claude",
  "branches",
  "access",
  "automation",
  "mcp-cli",
  "git-sync",
  "team",
  "settings",
] as const;

export type CloudWorkspaceSection = (typeof CLOUD_WORKSPACE_SECTIONS)[number];

import type { DesktopCloudScope } from "../../../../lib/cloudApi";
import { normalizeCloudEntryPath } from "../../utils";

export type OptionalAccessProvider = "mcp" | "sandbox";
export type CreateAccessIntent = "remote_workspace" | "git_remote" | "cli" | "ai_agent";

export const OPTIONAL_ACCESS_METHODS: Array<{
  provider: OptionalAccessProvider;
  direction: "inbound";
  description: string;
  supported: boolean;
}> = [
  {
    provider: "mcp",
    direction: "inbound",
    description: "External AI tools connect through MCP.",
    supported: true,
  },
  {
    provider: "sandbox",
    direction: "inbound",
    description: "Run tools with this folder mounted.",
    supported: false,
  },
];

export const CREATE_ACCESS_INTENT_OPTIONS: Array<{
  id: CreateAccessIntent;
  label: string;
  provider: string;
  preview: string;
  chips: string[];
}> = [
  {
    id: "remote_workspace",
    label: "Open editor",
    provider: "sandbox",
    preview: "Cursor opens a ready Git workspace",
    chips: ["Editor", "Git ready", "No clone"],
  },
  {
    id: "git_remote",
    label: "Clone repo",
    provider: "git_remote",
    preview: "git clone https://.../access.git",
    chips: ["Local files", "Git flow"],
  },
  {
    id: "cli",
    label: "Use shell",
    provider: "cli",
    preview: "puppyone fs ls /company/sales",
    chips: ["No clone", "Scriptable"],
  },
  {
    id: "ai_agent",
    label: "Connect AI agent",
    provider: "mcp",
    preview: "Agent calls approved file tools",
    chips: ["AI agent", "Tool calls"],
  },
];

export function normalizeAccessPath(path: string) {
  return normalizeCloudEntryPath(path).replace(/\/+/g, "/");
}

export function formatAccessPath(path: string) {
  const parts = normalizeAccessPath(path).split("/").filter(Boolean);
  return parts.length === 0 ? "Root" : ["Root", ...parts].join(" / ");
}

export function formatTreePath(path: string) {
  const normalized = normalizeAccessPath(path);
  return normalized ? `/${normalized}` : "Project files";
}

export function defaultScopeName(path: string) {
  if (!path) return "Project files";
  const parts = path.split("/").filter(Boolean);
  const last = parts.length > 0 ? parts[parts.length - 1] : path;
  return last
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (ch: string) => ch.toUpperCase());
}

export function normalizeAccessProviderKey(provider: string) {
  return provider.trim().toLowerCase().replace(/-/g, "_");
}

export function getAccessProviderLabel(provider: string) {
  const normalized = normalizeAccessProviderKey(provider);
  if (normalized === "cli") return "Context Drive CLI";
  if (normalized === "git" || normalized === "git_remote" || normalized === "filesystem") return "Git Remote";
  if (normalized === "mcp" || normalized === "mcp_endpoint") return "MCP Server";
  if (normalized === "sandbox" || normalized === "vm" || normalized === "remote_workspace") return "Remote Workspace";
  return provider
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function getCreateAccessTileProvider(provider: string) {
  const normalized = normalizeAccessProviderKey(provider);
  if (normalized === "cli") return "cli";
  if (normalized === "git" || normalized === "git_remote" || normalized === "filesystem") return "git";
  if (normalized === "mcp" || normalized === "mcp_endpoint") return "mcp";
  return "default";
}

export function getCliAccessRowId(scope: DesktopCloudScope) {
  return `${scope.id}:builtin:cli:${scope.id}`;
}

export function getGitAccessRowId(scope: DesktopCloudScope) {
  return `${scope.id}:builtin:git:${scope.id}`;
}

import type { LucideIcon } from "lucide-react";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudScope,
} from "../../lib/cloudApi";
import {
  getScopeDisplayName,
  isConnectorActiveStatus,
  shellQuote,
} from "./utils";

export type CloudAuthView = "main" | "signin" | "signup" | "signedIn";
export type CloudLoginMethod = "browser" | "google" | "github" | "email" | "password";
export type CloudLoginFeature = {
  label: string;
  icon: LucideIcon;
};

export type CloudAccessSurface = {
  id: string;
  provider: string;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  prompt?: string;
  commands?: Array<{ label: string; value: string; disabled?: boolean }>;
  endpoint?: DesktopCloudMcpEndpoint;
  connector?: DesktopCloudConnector;
};

export function buildCloudAccessSurfaces({
  scope,
  connectors,
  mcpEndpoints,
  apiBase,
  gitUrl,
  cliCommand,
  profileName,
}: {
  scope: DesktopCloudScope;
  connectors: DesktopCloudConnector[];
  mcpEndpoints: DesktopCloudMcpEndpoint[];
  apiBase: string;
  gitUrl: string;
  cliCommand: string;
  profileName: string;
}): CloudAccessSurface[] {
  const cliConnector = connectors.find((connector) => connector.provider === "cli");
  const gitConnector = connectors.find((connector) => (
    connector.provider === "filesystem"
    || connector.provider === "git"
    || connector.provider === "git_remote"
  ));
  const scopeName = getScopeDisplayName(scope);

  return [
    {
      id: `builtin:cli:${scope.id}`,
      provider: "cli",
      title: "Puppyone CLI",
      subtitle: "Direct terminal access",
      status: cliConnector?.status ?? (scope.access_key ? "active" : "missing"),
      statusLabel: cliConnector?.status ?? (scope.access_key ? "Active" : "Needs key"),
      prompt: `Use Puppyone CLI to read and write ${scopeName} from any terminal.`,
      connector: cliConnector,
      commands: [
        { label: "Login", value: cliCommand || "Open Cloud Access and regenerate an access key.", disabled: !cliCommand },
        { label: "Explore", value: `puppyone fs tree / --profile ${shellQuote(profileName)}\npuppyone fs ls / --profile ${shellQuote(profileName)}`, disabled: !cliCommand },
      ],
    },
    {
      id: `builtin:git:${scope.id}`,
      provider: "filesystem",
      title: "Git Remote",
      subtitle: "Native Git clone / push",
      status: gitConnector?.status ?? (gitUrl ? "active" : "missing"),
      statusLabel: gitConnector?.status ?? (gitUrl ? "Active" : "Needs key"),
      prompt: "This workspace is Git-native. Puppyone Cloud stays the source of truth.",
      connector: gitConnector,
      commands: [
        { label: "Existing folder", value: `git remote add puppyone ${gitUrl || "<git-url>"}\ngit fetch puppyone`, disabled: !gitUrl },
        { label: "Clone", value: `git clone ${gitUrl || "<git-url>"} ${shellQuote(scopeName)}`, disabled: !gitUrl },
      ],
    },
    ...mcpEndpoints.map((endpoint): CloudAccessSurface => {
      const accessLabel = endpoint.accesses?.length
        ? endpoint.accesses.map((access) => access.path || "/").join(", ")
        : endpoint.path || "/";
      const serverUrl = endpoint.api_key && apiBase
        ? `${apiBase}/api/v1/mcp/server/${endpoint.api_key}`
        : "";
      return {
        id: `mcp:${endpoint.id}`,
        provider: "mcp",
        title: endpoint.name || "MCP endpoint",
        subtitle: accessLabel,
        status: endpoint.status || "active",
        statusLabel: endpoint.status || "active",
        endpoint,
        commands: serverUrl ? [{ label: "Server URL", value: serverUrl }] : [],
      };
    }),
  ];
}

export function getCloudAccessAggregate(surfaces: CloudAccessSurface[]) {
  if (surfaces.some((surface) => surface.status === "error")) return { label: "Error", tone: "warning" };
  if (surfaces.some((surface) => surface.status === "syncing")) return { label: "Syncing", tone: "ready" };
  if (surfaces.every((surface) => isConnectorActiveStatus(surface.status))) return { label: "Active", tone: "ready" };
  if (surfaces.some((surface) => isConnectorActiveStatus(surface.status))) return { label: "Mixed", tone: "warning" };
  return { label: "Paused", tone: "" };
}

import type { LucideIcon } from "lucide-react";
import type {
  DesktopCloudConnector,
  DesktopCloudMcpEndpoint,
  DesktopCloudRepositoryView,
} from "../../lib/cloudApi";
import {
  getScopeIdentifierName,
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
  /** Provider-owned/user-authored name only. First-party names are resolved from provider codes. */
  title: string;
  /** Provider-owned/path detail only. First-party subtitles are resolved at the presentation boundary. */
  subtitle: string;
  status: string;
  /** Provider-owned prompt only. Built-in instructions are resolved from stable provider/id metadata. */
  prompt?: string;
  commands?: Array<{
    id: "login" | "explore" | "existing-folder" | "clone" | "server-url";
    value: string;
    disabled?: boolean;
  }>;
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
  scope: DesktopCloudRepositoryView;
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
  const scopeName = getScopeIdentifierName(scope);

  return [
    {
      id: `builtin:cli:${scope.id}`,
      provider: "cli",
      title: "",
      subtitle: "",
      status: cliConnector?.status ?? "missing",
      connector: cliConnector,
      commands: [
        { id: "login", value: cliCommand, disabled: !cliCommand },
        { id: "explore", value: `puppyone fs tree / --profile ${shellQuote(profileName)}\npuppyone fs ls / --profile ${shellQuote(profileName)}`, disabled: !cliCommand },
      ],
    },
    {
      id: `builtin:git:${scope.id}`,
      provider: "filesystem",
      title: "",
      subtitle: "",
      status: gitConnector?.status ?? (gitUrl ? "active" : "missing"),
      connector: gitConnector,
      commands: [
        { id: "existing-folder", value: `git remote add puppyone ${gitUrl || "<git-url>"}\ngit fetch puppyone`, disabled: !gitUrl },
        { id: "clone", value: `git clone ${gitUrl || "<git-url>"} ${shellQuote(scopeName)}`, disabled: !gitUrl },
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
        title: endpoint.name || "",
        subtitle: accessLabel,
        status: endpoint.status || "active",
        endpoint,
        commands: serverUrl ? [{ id: "server-url", value: serverUrl }] : [],
      };
    }),
  ];
}

export function getCloudAccessAggregate(surfaces: CloudAccessSurface[]) {
  if (surfaces.some((surface) => surface.status === "error")) return { code: "error", tone: "warning" } as const;
  if (surfaces.some((surface) => surface.status === "syncing")) return { code: "syncing", tone: "ready" } as const;
  if (surfaces.every((surface) => isConnectorActiveStatus(surface.status))) return { code: "active", tone: "ready" } as const;
  if (surfaces.some((surface) => isConnectorActiveStatus(surface.status))) return { code: "mixed", tone: "warning" } as const;
  return { code: "paused", tone: "" } as const;
}

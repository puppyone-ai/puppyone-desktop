import { normalizeProviderKey } from "../../utils";
import type { AccessPointKind } from "./accessPoint";

export type AccessPointKindDefinition = Readonly<{
  kind: AccessPointKind;
  aliases: readonly string[];
  titleId?: string;
  subtitleId?: string;
  promptId?: string;
}>;

export const ACCESS_POINT_KIND_REGISTRY: Record<AccessPointKind, AccessPointKindDefinition> = {
  cli: {
    kind: "cli",
    aliases: ["cli"],
    titleId: "cloud.access.surface.cli.title",
    subtitleId: "cloud.access.surface.cli.subtitle",
    promptId: "cloud.access.surface.cli.prompt",
  },
  git: {
    kind: "git",
    aliases: ["filesystem", "git", "git_remote"],
    titleId: "cloud.access.surface.git.title",
    subtitleId: "cloud.access.surface.git.subtitle",
    promptId: "cloud.access.surface.git.prompt",
  },
  mcp: {
    kind: "mcp",
    aliases: ["mcp", "mcp_endpoint"],
    titleId: "cloud.access.surface.mcp.title",
    promptId: "cloud.access.surface.mcp.prompt",
  },
  vm: {
    kind: "vm",
    aliases: ["vm", "remote_workspace", "sandbox"],
    titleId: "cloud.access.surface.vm.title",
    promptId: "cloud.access.surface.vm.prompt",
  },
  custom: {
    kind: "custom",
    aliases: [],
  },
};

const ACCESS_POINT_ALIAS_MAP = new Map<string, AccessPointKind>(
  Object.values(ACCESS_POINT_KIND_REGISTRY).flatMap((definition) => (
    definition.aliases.map((alias) => [alias, definition.kind] as const)
  )),
);

export function resolveAccessPointKind(provider: string): AccessPointKind {
  return ACCESS_POINT_ALIAS_MAP.get(normalizeProviderKey(provider)) ?? "custom";
}

export function getAccessPointKindDefinition(kind: AccessPointKind): AccessPointKindDefinition {
  return ACCESS_POINT_KIND_REGISTRY[kind];
}

import { ChevronDown, ChevronRight, Copy, ExternalLink, Monitor, Settings, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { CloudAccessSurface } from "../../model";
import { formatProviderLabel, normalizeProviderKey, providerIcon } from "../../utils";
import { isGitAccessSurface, isVmAccessSurface } from "./accessSurfaceModel";

export type DesktopCloudAccessMethodMeta = {
  title: string;
  description: string;
  actionLabel: string;
  expandedActionLabel: string;
  actionIcon: ReactNode;
  previewButtonLabel: string;
  previewIcon: ReactNode;
};

type AccessProviderRegistryItem = {
  tileProvider: "cli" | "git" | "mcp" | "vm" | "automation";
  iconSize: number;
  icon?: LucideIcon;
  meta: (surface: CloudAccessSurface) => DesktopCloudAccessMethodMeta;
};

const ACCESS_PROVIDER_REGISTRY: Record<string, AccessProviderRegistryItem> = {
  cli: {
    tileProvider: "cli",
    iconSize: 17,
    meta: () => ({
      title: "Context Drive CLI",
      description: "Use Puppyone's scoped FS CLI to let an agent read and write this cloud drive without cloning it.",
      actionLabel: "Configure CLI",
      expandedActionLabel: "Hide config",
      actionIcon: <Settings size={12} />,
      previewButtonLabel: "Copy prompt",
      previewIcon: <Copy size={14} />,
    }),
  },
  git: {
    tileProvider: "git",
    iconSize: 34,
    meta: () => ({
      title: "Git Remote",
      description: "Use a native Git remote for clone, pull, commit, and push workflows.",
      actionLabel: "View Git remote",
      expandedActionLabel: "Hide Git remote",
      actionIcon: <ExternalLink size={12} />,
      previewButtonLabel: "Copy prompt",
      previewIcon: <Copy size={14} />,
    }),
  },
  mcp: {
    tileProvider: "mcp",
    iconSize: 19,
    meta: (surface) => ({
      title: "MCP Server",
      description: surface.status === "missing"
        ? "Create a scoped Model Context Protocol endpoint for external AI clients."
        : "Connect an MCP-compatible client to this scoped workspace.",
      actionLabel: surface.status === "missing" ? "Create endpoint" : "Show config",
      expandedActionLabel: "Hide config",
      actionIcon: <ChevronDown size={12} />,
      previewButtonLabel: "View connection",
      previewIcon: <ExternalLink size={14} />,
    }),
  },
  vm: {
    tileProvider: "vm",
    iconSize: 18,
    meta: () => ({
      title: "Remote Workspace",
      description: "Add your SSH public key, then open this scope in Cursor or VS Code over Remote-SSH.",
      actionLabel: "Add SSH key",
      expandedActionLabel: "Hide remote",
      actionIcon: <ChevronRight size={12} />,
      previewButtonLabel: "Open remote",
      previewIcon: <ExternalLink size={14} />,
    }),
  },
};

export function getDesktopCloudAccessMethodMeta(surface: CloudAccessSurface): DesktopCloudAccessMethodMeta {
  return getAccessProviderRegistryItem(surface.provider).meta(surface);
}

export function getAccessMethodTileProvider(provider: string) {
  return getAccessProviderRegistryItem(provider).tileProvider;
}

export function getAccessMethodIconSize(provider: string) {
  return getAccessProviderRegistryItem(provider).iconSize;
}

export function DesktopCloudProviderIcon({ provider, size }: { provider: string; size: number }) {
  if (isVmAccessSurface(provider)) {
    return <Monitor size={size} />;
  }
  if (isGitAccessSurface(provider)) {
    return (
      <img
        className="desktop-cloud-access-git-brand-icon"
        src="/assets/brand/git-icon-inverse.svg"
        alt=""
        width={size}
        height={size}
      />
    );
  }
  const Icon = providerIcon(provider);
  return <Icon size={size} />;
}

function getAccessProviderRegistryItem(provider: string): AccessProviderRegistryItem {
  const normalized = normalizeProviderKey(provider);
  if (normalized === "filesystem" || normalized === "git_remote") return ACCESS_PROVIDER_REGISTRY.git;
  if (normalized === "mcp_endpoint") return ACCESS_PROVIDER_REGISTRY.mcp;
  if (normalized === "remote_workspace" || normalized === "sandbox") return ACCESS_PROVIDER_REGISTRY.vm;
  return ACCESS_PROVIDER_REGISTRY[normalized] ?? {
    tileProvider: "automation",
    iconSize: 19,
    meta: (surface) => ({
      title: surface.title || formatProviderLabel(surface.provider),
      description: surface.subtitle || `${formatProviderLabel(surface.provider)} access for this scope.`,
      actionLabel: "Open",
      expandedActionLabel: "Hide",
      actionIcon: <ChevronRight size={12} />,
      previewButtonLabel: "Copy prompt",
      previewIcon: <Copy size={14} />,
    }),
  };
}

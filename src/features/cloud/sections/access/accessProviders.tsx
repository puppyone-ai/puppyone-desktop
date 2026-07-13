import { ChevronDown, ChevronRight, Copy, ExternalLink, Monitor, Settings, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { MessageFormatter } from "@puppyone/localization/core";
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
  meta: (surface: CloudAccessSurface, t: MessageFormatter) => DesktopCloudAccessMethodMeta;
};

const ACCESS_PROVIDER_REGISTRY: Record<string, AccessProviderRegistryItem> = {
  cli: {
    tileProvider: "cli",
    iconSize: 17,
    meta: (_surface, t) => ({
      title: t("cloud.access.method.cli.title"),
      description: t("cloud.access.method.cli.description"),
      actionLabel: t("cloud.access.method.cli.action"),
      expandedActionLabel: t("cloud.access.method.hideConfig"),
      actionIcon: <Settings size={12} />,
      previewButtonLabel: t("cloud.common.copyPrompt"),
      previewIcon: <Copy size={14} />,
    }),
  },
  git: {
    tileProvider: "git",
    iconSize: 34,
    meta: (_surface, t) => ({
      title: t("cloud.access.surface.git.title"),
      description: t("cloud.access.method.git.description"),
      actionLabel: t("cloud.access.method.git.action"),
      expandedActionLabel: t("cloud.access.method.git.hide"),
      actionIcon: <ExternalLink size={12} />,
      previewButtonLabel: t("cloud.common.copyPrompt"),
      previewIcon: <Copy size={14} />,
    }),
  },
  mcp: {
    tileProvider: "mcp",
    iconSize: 19,
    meta: (surface, t) => ({
      title: t("cloud.access.surface.mcp.title"),
      description: surface.status === "missing"
        ? t("cloud.access.surface.mcp.prompt")
        : t("cloud.access.method.mcp.connectedDescription"),
      actionLabel: surface.status === "missing" ? t("cloud.access.method.mcp.create") : t("cloud.access.method.showConfig"),
      expandedActionLabel: t("cloud.access.method.hideConfig"),
      actionIcon: <ChevronDown size={12} />,
      previewButtonLabel: t("cloud.access.method.mcp.viewConnection"),
      previewIcon: <ExternalLink size={14} />,
    }),
  },
  vm: {
    tileProvider: "vm",
    iconSize: 18,
    meta: (_surface, t) => ({
      title: t("cloud.access.surface.vm.title"),
      description: t("cloud.access.surface.vm.prompt"),
      actionLabel: t("cloud.access.method.vm.addSshKey"),
      expandedActionLabel: t("cloud.access.method.vm.hideRemote"),
      actionIcon: <ChevronRight className="po-directional-icon" size={12} />,
      previewButtonLabel: t("cloud.access.method.vm.openRemote"),
      previewIcon: <ExternalLink size={14} />,
    }),
  },
};

export function getDesktopCloudAccessMethodMeta(surface: CloudAccessSurface, t: MessageFormatter): DesktopCloudAccessMethodMeta {
  return getAccessProviderRegistryItem(surface.provider).meta(surface, t);
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
    meta: (surface, t) => ({
      title: surface.title || formatProviderLabel(surface.provider, t),
      description: surface.subtitle || t("cloud.access.method.generic.description", { provider: formatProviderLabel(surface.provider, t) }),
      actionLabel: t("cloud.common.open"),
      expandedActionLabel: t("cloud.common.hide"),
      actionIcon: <ChevronRight className="po-directional-icon" size={12} />,
      previewButtonLabel: t("cloud.common.copyPrompt"),
      previewIcon: <Copy size={14} />,
    }),
  };
}

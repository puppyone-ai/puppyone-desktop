import type { ReactNode } from "react";

export type WorkspaceSurfaceId =
  | "data"
  | "git"
  | "plugins"
  | "cloud"
  | "access"
  | "automation"
  | "settings";

export type WorkspaceSurfaceLifecycle = "keep-alive" | "on-demand";

export type WorkspaceSurfaceNavigationGroup =
  | "workspace"
  | "cloud-tools"
  | "cloud-hub"
  | "settings";

export type WorkspaceSurfaceNavigation = {
  labelId: string;
  group: WorkspaceSurfaceNavigationGroup;
  order: number;
};

export type WorkspaceSurfaceCapabilities = {
  workspaceKind: "local" | "cloud";
  cloudEnabled: boolean;
  cloudProjectAvailable: boolean;
  pluginsEnabled: boolean;
};

export type WorkspaceSurfaceContent = {
  sidebar: ReactNode | null;
  main: ReactNode | null;
};

export type WorkspaceSurfaceAdapters = Readonly<Record<
  WorkspaceSurfaceId,
  () => WorkspaceSurfaceContent
>>;

export type WorkspaceSurfaceContributionDefinition = {
  id: WorkspaceSurfaceId;
  navigation: WorkspaceSurfaceNavigation;
  lifecycle: {
    sidebar: WorkspaceSurfaceLifecycle;
    main: WorkspaceSurfaceLifecycle;
  };
  isAvailable: (capabilities: WorkspaceSurfaceCapabilities) => boolean;
};

export type WorkspaceSurfaceContribution = WorkspaceSurfaceContributionDefinition & {
  create: (adapters: WorkspaceSurfaceAdapters) => WorkspaceSurfaceContent;
};

export type ResolvedWorkspaceSurface = WorkspaceSurfaceContribution & {
  content: WorkspaceSurfaceContent;
};

export { WorkspaceSurfaceOutlet } from "./WorkspaceSurfaceOutlet";
export {
  WORKSPACE_SURFACE_CONTRIBUTIONS,
  defineWorkspaceSurface,
  getAvailableWorkspaceSurfaces,
  isWorkspaceSurfaceAvailable,
  resolveWorkspaceSurface,
  resolveWorkspaceSurfaceContribution,
} from "./workspaceSurfaceRegistry";
export type {
  ResolvedWorkspaceSurface,
  WorkspaceSurfaceCapabilities,
  WorkspaceSurfaceAdapters,
  WorkspaceSurfaceContent,
  WorkspaceSurfaceContribution,
  WorkspaceSurfaceContributionDefinition,
  WorkspaceSurfaceId,
  WorkspaceSurfaceLifecycle,
  WorkspaceSurfaceNavigation,
  WorkspaceSurfaceNavigationGroup,
} from "./workspaceSurfaceTypes";
export { useWorkspaceSurfaceContent } from "./useWorkspaceSurfaceContent";
export type {
  DesktopWorkspaceCloudSurfaceController,
  WorkspaceSurfaceContentResult,
} from "./useWorkspaceSurfaceContent";

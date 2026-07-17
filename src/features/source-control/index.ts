export { GitSidebar } from "./SourceControlSidebar";
export { VersionControlIcon } from "./VersionControlIcon";
export { GitStatusView } from "./GitStatusView";
export { createSourceControlWorkspaceSurface } from "./SourceControlWorkspaceSurface";
export type { SourceControlWorkspaceSurfaceProps } from "./SourceControlWorkspaceSurface";
export type { GitMainPanel, GitWorkingSelection } from "./types";
export type { DesktopGitController } from "./useDesktopGitController";
export { getGitHostingMode } from "./viewModel";
export {
  getCanonicalPuppyoneRemote,
  getPuppyoneRemote,
  maskRemoteUrl,
  parsePuppyoneRemote,
} from "./remotes";

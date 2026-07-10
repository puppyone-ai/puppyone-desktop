export * from "./core/types";
export type {
  FileCategory,
  FileFormat,
  FilePreviewKind,
  FileSemanticKind,
  GenericViewerId,
  IngestStrategy,
  SpecialViewerId,
  ViewerId,
} from "./core/fileFormats";
export {
  FILE_FORMATS,
  UNKNOWN_FORMAT,
  getFilePreviewKind,
  getFileSemanticKind,
  getMatchedExtension,
  getPreferredMimeType,
  getPreviewKindForFormat,
  getSemanticKindForFormat,
  isKnownFileFormat,
  isTextLikeFile,
  isTextLikeFileFormat,
  resolveFileFormat,
} from "./core/fileFormats";

export { DataWorkspace } from "./data/DataWorkspace";
export type {
  DataWorkspaceFolderExpansionStrategy,
  DataWorkspaceProps,
  DataWorkspaceState,
} from "./data/DataWorkspace";
export { EXPLORER_TREE_NODE_DRAG_TYPE, ExplorerTree } from "./data/ExplorerTree";
export type { ExplorerSelectionIntent, ExplorerTreeProps } from "./data/ExplorerTree";
export { FilePreview } from "./data/FilePreview";
export type { FilePreviewBodyContext, FilePreviewProps } from "./data/FilePreview";
export { ProjectsHeader as WorkspaceHeader } from "./data/ProjectsHeader";
export type {
  BreadcrumbSegment,
  ProjectsHeaderProps as WorkspaceHeaderProps,
} from "./data/ProjectsHeader";

export { EditorHost } from "./editor/EditorHost";
export type { EditorHostProps } from "./editor/EditorHost";
export {
  classifyEditorViewerCapability,
  coreViewerCapability,
  EDITOR_VIEWERS,
  ExternalViewerAdapter,
  getEditorSourceRequirement,
  resolveEditorViewer,
  resolveViewerRoute,
  resolveViewerRouteForDocument,
  shouldReadEditorContent,
} from "./editor/viewerRegistry";
export type { ExternalViewerAdapterProps } from "./editor/viewerRegistry";
export { findPackCandidates } from "./editor/viewerCapability";
export type { ResolveViewerRouteInput } from "./editor/viewerCapability";
export { EMPTY_VIEWER_PACK_SNAPSHOT } from "./editor/viewerPackTypes";
export type {
  CoreViewerCapability,
  DocumentSourceKind,
  ViewerContribution,
  ViewerPackDescriptor,
  ViewerPackFormatContribution,
  ViewerPackSessionDescriptor,
  ViewerPackSnapshot,
  ViewerRoutePlaceholderReason,
  ViewerRouteResult,
} from "./editor/viewerPackTypes";
export type { ViewerPackInstallFallbackRenderer } from "./editor/PuppyoneEditorHost";
export {
  VIEWER_HOST_IPC_CHANNELS,
} from "./editor/viewerHostApi";
export type {
  ViewerDocumentMeta,
  ViewerHostApiV1,
  ViewerHostApiVersion,
  ViewerHostIpcChannel,
  ViewerResourceApiV1,
  ViewerResourceChunk,
  ViewerResourceHandleMeta,
  ViewerResourceRangeRequest,
  ViewerStatus,
  ViewerThemeMode,
  ViewerThemeSnapshot,
} from "./editor/viewerHostApi";
export type {
  EditorDocument,
  EditorDocumentKind,
  EditorMode,
  EditorSaveMode,
  EditorSourceRequirement,
  EditorViewer,
  EditorViewerContext,
  EditorViewerMatch,
  ExternalViewerSurfaceRenderer,
  ExternalViewerSurfaceRequest,
  MarkdownBacklink,
  MarkdownBacklinkReference,
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
  MarkdownWikiLinkResolvedTarget,
} from "./editor/viewerTypes";
export { PlainTextEditor } from "./editor/PlainTextEditor";
export type { PlainTextEditorProps } from "./editor/PlainTextEditor";
export { CsvTableEditor } from "./editor/CsvTableEditor";
export type { CsvTableEditorProps } from "./editor/CsvTableEditor";
export { EditorSaveButton as SaveStatusButton } from "./editor/EditorSaveButton";
export type {
  EditorSaveButtonProps as SaveStatusButtonProps,
  SaveStatus,
} from "./editor/EditorSaveButton";
export {
  hasVerticalOverflow,
  useScrollEdgeState,
  useScrollableDescendantClasses,
  useScrollableState,
} from "./primitives/useScrollableClass";
export type {
  ScrollEdgeState,
  ScrollEdgeStateOptions,
  ScrollableDescendantClassOptions,
  ScrollableStateOptions,
} from "./primitives/useScrollableClass";
export { usePaneResizeDrag } from "./primitives/usePaneResizeDrag";
export type {
  PaneResizeDragPoint,
  PaneResizeDragSession,
  UsePaneResizeDragOptions,
} from "./primitives/usePaneResizeDrag";
export { ConflictMarkerBanner } from "./editor/ConflictMarkerBanner";
export {
  createAiEditFile,
  createAiEditRequest,
  getAiEditFileForPath,
  getAiEditTotals,
} from "./editor/ai-edits/diff";
export type {
  AiEditFile,
  AiEditFileStatus,
  AiEditHunk,
  AiEditHunkKind,
  AiEditHunkState,
  AiEditLineRange,
  AiEditRequest,
} from "./editor/ai-edits/types";

export {
  FILE_ICON_THEMES,
  FILE_TYPE_ICONS,
  FileGlyphIcon,
  FilePreviewIcon,
  getFileAccent,
  getFileExtension,
  getFileIcon,
  getFileVisualKind,
  isFileIconThemeId,
} from "./file/fileIcons";
export type { FileIconThemeId, FileVisualKind } from "./file/fileIcons";

export { Button } from "./primitives/Button";
export type { ButtonProps } from "./primitives/Button";
export { IconButton } from "./primitives/IconButton";
export type { IconButtonProps } from "./primitives/IconButton";
export { EmptyState } from "./primitives/EmptyState";
export type { EmptyStateProps } from "./primitives/EmptyState";
export { StatusBadge } from "./primitives/StatusBadge";
export type { StatusBadgeProps } from "./primitives/StatusBadge";
export { DotsLoader, InlineLoading, PulseGridLoader } from "./primitives/LoadingIndicator";
export type { LoaderSize, LoaderTone } from "./primitives/LoadingIndicator";

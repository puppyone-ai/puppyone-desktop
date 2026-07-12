export * from "./core/types";
export {
  TYPOGRAPHY_CHANGE_EVENT,
  dispatchTypographyChange,
  subscribeTypographyChanges,
} from "./core/typography";
export type {
  TypographyChangeDetail,
  TypographyChangePhase,
} from "./core/typography";
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
export { MarkdownLinkIndexCoordinator } from "./editor/markdown/linkIndex";
export type {
  MarkdownLinkIndexDocumentReader,
  MarkdownLinkIndexRequest,
} from "./editor/markdown/linkIndex";
export type {
  DataWorkspaceFolderExpansionStrategy,
  DataWorkspaceProps,
  DataWorkspaceState,
} from "./data/DataWorkspace";
export { EXPLORER_TREE_NODE_DRAG_TYPE, ExplorerTree } from "./data/ExplorerTree";
export type { ExplorerSelectionIntent, ExplorerTreeProps } from "./data/ExplorerTree";
export {
  getRendererPerformanceTracker,
  RendererPerformanceTracker,
} from "./performance/rendererPerformance";
export type {
  RendererPerformanceStage,
  RendererPerformanceSummary,
  RendererPerformanceTrace,
} from "./performance/rendererPerformance";
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
  createPresetViewerRegistry,
  definePresetViewer,
  EDITOR_VIEWERS,
  getEditorSourceRequirement,
  PRESET_VIEWER_REGISTRY,
  PRESET_VIEWERS,
  resolveEditorViewer,
  shouldReadEditorContent,
} from "./editor/viewerRegistry";
export type {
  PresetViewerRegistry,
} from "./editor/viewerRegistry";
export {
  coreViewerCapability,
  getPresetViewerDefinition,
  getPresetViewerDefinitionForViewerId,
  PRESET_VIEWER_MANIFEST,
} from "./editor/presetViewerManifest";
export type {
  PresetViewerDefinition,
  PresetViewerManifest,
} from "./editor/presetViewerManifest";
export {
  PRESET_VIEWER_CAPABILITIES,
  PRESET_VIEWER_CONTRACT_VERSION,
  PRESET_VIEWER_RUNTIMES,
  PRESET_VIEWER_SOURCES,
} from "./editor/viewerContract";
export type {
  PresetViewerContractVersion,
  PresetViewerRuntime,
  PresetViewerSource,
} from "./editor/viewerContract";
export { findPackCandidates, resolveViewerRoute } from "./editor/viewerCapability";
export type { ResolveViewerRouteInput } from "./editor/viewerCapability";
export {
  ExternalViewerAdapter,
  resolveViewerRouteForDocument,
} from "./editor/viewerPackAdapter";
export type { ExternalViewerAdapterProps } from "./editor/viewerPackAdapter";
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
export type {
  ExternalViewerSurfaceRenderer,
  ViewerExtensionHostAdapter,
  ViewerExtensionInstallFallbackRenderer,
} from "./editor/viewerHostAdapters";
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
  MarkdownBacklink,
  MarkdownBacklinkReference,
  MarkdownHtmlTrustMode,
  MarkdownLinkGraph,
  MarkdownWikiLinkResolvedTarget,
  PresetViewerContribution,
  PresetViewerImplementation,
  PresetViewerRenderContext,
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
export { validateOfficePackageDecompression } from "./editor/security/officePackageValidationTask";
export type {
  OfficePackageDecompressionBudget,
  OfficePackageValidationOptions,
  OfficePackageValidationReport,
  OfficePackageValidationResult,
} from "./editor/security/officePackageValidationTask";
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

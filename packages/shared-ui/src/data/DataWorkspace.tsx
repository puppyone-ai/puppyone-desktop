import { Link2, MoreVertical, Plus } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { DataCapabilities, DataNode, DataPort, FileContent, Workspace } from "../core/types";
import { defaultDataCapabilities } from "../core/types";
import { preloadPresetViewer } from "../editor/PresetViewerRenderer";
import {
  getEditorSourceRequirement,
  resolveEditorViewer,
  shouldReadEditorContent,
} from "../editor/viewerRegistry";
import {
  createMarkdownLinkGraph,
  EMPTY_MARKDOWN_LINK_GRAPH_INDEX,
  MarkdownLinkIndexCoordinator,
  type MarkdownLinkGraphDocument,
  type MarkdownLinkGraphIndexSnapshot,
} from "../editor/markdown/linkIndex";
import { resolveMarkdownAssetPath } from "../editor/markdown/assetResolution";
import { ExplorerTree } from "./ExplorerTree";
import { FilePreview, type FilePreviewProps } from "./FilePreview";
import { ProjectsHeader } from "./ProjectsHeader";
import type { EditorSaveMode } from "../editor/PuppyoneEditorHost";
import type {
  DocumentSourceKind,
  EditorInteractionPreferences,
  MarkdownHtmlTrustMode,
} from "../editor/viewerTypes";
import type { ViewerExtensionHostAdapter } from "../editor/viewerHostAdapters";
import { getAiEditFileForPath } from "../editor/ai-edits/diff";
import type { AiEditRequest } from "../editor/ai-edits/types";
import type { DocumentPersistedCommit } from "../editor/document-session/types";
import { flushActiveDocumentSessions } from "../editor/document-session/activeDocumentSessions";
import type { FileIconThemeId } from "../file/fileIcons";
import { usePaneResizeDrag } from "../primitives/usePaneResizeDrag";
import { getRendererPerformanceTracker } from "../performance/rendererPerformance";
import { FileOpenRequestCoordinator } from "./file-open/fileOpenRequestCoordinator";
import { putBoundedFileContent } from "./file-open/fileContentCache";

const rendererPerformance = getRendererPerformanceTracker();

export type DataWorkspaceState = {
  tree: DataNode[];
  activePath: string | null;
  activeNode: DataNode | null;
  selectedPaths: string[];
  selectedNodes: DataNode[];
  currentFolderPath: string | null;
  selectedFile: DataNode | null;
  loadingPath: string | null;
  loadError: string | null;
  rootLoading: boolean;
  fileContent: FileContent | null;
  fileLoading: boolean;
  fileError: string | null;
  fileUrl: string | null;
  fileUrlLoading: boolean;
  fileUrlError: string | null;
};

type CommittedPreviewDocument = {
  node: DataNode;
  fileContent: FileContent | null;
  fileUrl: string | null;
  fileUrlLoading: boolean;
  fileUrlError: string | null;
  fileError: string | null;
};

type MoveOperation = {
  node: DataNode;
  previousPath: string;
  nextPath: string;
  previousParentPath: string | null;
};

export type DataWorkspaceSlot = ReactNode | ((state: DataWorkspaceState) => ReactNode);
export type DataWorkspaceFolderSlot = ReactNode | ((state: DataWorkspaceState, folder: DataNode) => ReactNode);
export type DataWorkspaceNodeSlot = ReactNode | ((state: DataWorkspaceState, node: DataNode) => ReactNode);
export type DataWorkspaceFolderExpansionStrategy = "load-before-expand" | "optimistic";
export type DataWorkspaceActivePathChangeContext = Readonly<{
  documentSessionsDrained: true;
}>;

const DRAINED_ACTIVE_PATH_CHANGE: DataWorkspaceActivePathChangeContext = Object.freeze({
  documentSessionsDrained: true,
});

export type DataWorkspaceProps = {
  workspace: Workspace;
  dataPort: DataPort;
  capabilities?: DataCapabilities;
  activePath?: string | null;
  defaultActivePath?: string | null;
  showHeader?: boolean;
  showExplorerToolbar?: boolean;
  headerSlot?: DataWorkspaceSlot;
  headerActionSlot?: DataWorkspaceSlot;
  explorerToolbarSlot?: DataWorkspaceSlot;
  explorerRailSlot?: DataWorkspaceSlot;
  explorerSlot?: DataWorkspaceSlot;
  explorerFooterSlot?: DataWorkspaceSlot;
  collapsedExplorerSlot?: DataWorkspaceSlot;
  explorerListEndSlot?: DataWorkspaceSlot;
  showExplorerRoot?: boolean;
  explorerRootContentSlot?: DataWorkspaceSlot;
  explorerRootActionSlot?: DataWorkspaceSlot;
  explorerFolderActionSlot?: DataWorkspaceFolderSlot;
  explorerNodeActionSlot?: DataWorkspaceNodeSlot;
  resizableExplorer?: boolean;
  explorerCollapsed?: boolean;
  explorerWidth?: number;
  defaultExplorerWidth?: number;
  minExplorerWidth?: number;
  maxExplorerWidth?: number;
  collapsedExplorerWidth?: number;
  mainSlot?: DataWorkspaceSlot;
  emptySlot?: ReactNode;
  showPreviewHeader?: boolean;
  hidePreviewSourceView?: boolean;
  fileIconTheme?: FileIconThemeId;
  editorInteractionPreferences?: EditorInteractionPreferences;
  editorSaveMode?: EditorSaveMode;
  htmlTrustMode?: MarkdownHtmlTrustMode;
  previewActionSlot?: FilePreviewProps["actionSlot"];
  renderPreviewBody?: FilePreviewProps["renderBody"];
  previewAccessorySlot?: DataWorkspaceSlot;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  documentSourceKind?: DocumentSourceKind;
  aiEditRequest?: AiEditRequest | null;
  enableMarkdownLinkContentIndexing?: boolean;
  folderExpansionStrategy?: DataWorkspaceFolderExpansionStrategy;
  refreshKey?: unknown;
  onExplorerWidthChange?: (width: number) => void;
  onExplorerCollapsedChange?: (collapsed: boolean) => void;
  onActivePathChange?: (
    path: string | null,
    node: DataNode | null,
    context?: DataWorkspaceActivePathChangeContext,
  ) => void | Promise<void>;
  onActiveNodeChange?: (node: DataNode | null) => void;
  onExplorerRootClick?: (state: DataWorkspaceState, event: ReactMouseEvent<HTMLElement>) => void;
  onExplorerRootContextMenu?: (state: DataWorkspaceState, event: ReactMouseEvent<HTMLDivElement>) => void;
  onExplorerNodeContextMenu?: (
    state: DataWorkspaceState,
    node: DataNode,
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
  explorerCutPaths?: ReadonlySet<string>;
  onCopyNodes?: (nodes: DataNode[]) => void | Promise<void>;
  onCutNodes?: (nodes: DataNode[]) => void | Promise<void>;
  onPasteNodes?: (targetFolderPath: string | null) => void | Promise<void>;
  onDuplicateNodes?: (nodes: DataNode[]) => void | Promise<void>;
  onOpenExternalUrl?: (href: string) => void | Promise<void>;
  onCreate?: (folderPath: string | null) => void;
  onMore?: (state: DataWorkspaceState) => void;
  onAccess?: (folderPath: string | null) => void;
  labels?: Partial<{
    root: string;
    loadingWorkspace: string;
  }>;
};

const ROOT_FOLDER_KEY = "__puppyone_workspace_root__";
const DEFAULT_EXPLORER_WIDTH = 320;
const MIN_EXPLORER_WIDTH = 240;
const MAX_EXPLORER_WIDTH = 520;
const COLLAPSED_EXPLORER_WIDTH = 47;
const MARKDOWN_LINK_INDEX_MAX_FILES = 250;

export function DataWorkspace({
  workspace,
  dataPort,
  capabilities,
  activePath,
  defaultActivePath = null,
  showHeader = true,
  showExplorerToolbar = true,
  headerSlot,
  headerActionSlot,
  explorerToolbarSlot,
  explorerRailSlot,
  explorerSlot,
  explorerFooterSlot,
  collapsedExplorerSlot,
  explorerListEndSlot,
  showExplorerRoot = true,
  explorerRootContentSlot,
  explorerRootActionSlot,
  explorerFolderActionSlot,
  explorerNodeActionSlot,
  resizableExplorer = false,
  explorerCollapsed = false,
  explorerWidth,
  defaultExplorerWidth = DEFAULT_EXPLORER_WIDTH,
  minExplorerWidth = MIN_EXPLORER_WIDTH,
  maxExplorerWidth = MAX_EXPLORER_WIDTH,
  collapsedExplorerWidth = COLLAPSED_EXPLORER_WIDTH,
  mainSlot,
  emptySlot,
  showPreviewHeader = true,
  hidePreviewSourceView = false,
  fileIconTheme = "default",
  editorInteractionPreferences,
  editorSaveMode = "manual",
  htmlTrustMode = "safe",
  previewActionSlot,
  renderPreviewBody,
  previewAccessorySlot,
  viewerExtensionAdapter = null,
  documentSourceKind,
  aiEditRequest = null,
  enableMarkdownLinkContentIndexing = true,
  folderExpansionStrategy = "load-before-expand",
  refreshKey,
  onExplorerWidthChange,
  onExplorerCollapsedChange,
  onActivePathChange,
  onActiveNodeChange,
  onExplorerRootClick,
  onExplorerRootContextMenu,
  onExplorerNodeContextMenu,
  explorerCutPaths,
  onCopyNodes,
  onCutNodes,
  onPasteNodes,
  onDuplicateNodes,
  onOpenExternalUrl,
  onCreate,
  onMore,
  onAccess,
  labels,
}: DataWorkspaceProps) {
  const { direction, t } = useLocalization();
  const resolvedCapabilities = { ...defaultDataCapabilities, ...capabilities };
  const resolvedDocumentSourceKind: DocumentSourceKind = workspace.path.startsWith("cloud://")
    ? "cloud"
    : "local";
  const [tree, setTree] = useState<DataNode[]>([]);
  const [internalActivePath, setInternalActivePath] = useState<string | null>(defaultActivePath);
  const [selectedNodePaths, setSelectedNodePaths] = useState<Set<string>>(() => (
    defaultActivePath ? new Set([defaultActivePath]) : new Set()
  ));
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(defaultActivePath);
  const [rootLoaded, setRootLoaded] = useState(false);
  const [loadingFolderPaths, setLoadingFolderPaths] = useState<Set<string>>(() => new Set([ROOT_FOLDER_KEY]));
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(() => new Set(collectAncestorFolderPaths(defaultActivePath)));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileContentCache, setFileContentCache] = useState<Record<string, FileContent>>({});
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileErrorPath, setFileErrorPath] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileUrlPath, setFileUrlPath] = useState<string | null>(null);
  const [fileUrlLoading, setFileUrlLoading] = useState(false);
  const [fileUrlError, setFileUrlError] = useState<string | null>(null);
  const [documentNavigationError, setDocumentNavigationError] = useState<string | null>(null);
  const [markdownLinkIndexing, setMarkdownLinkIndexing] = useState(false);
  const [markdownLinkIndexBuilding, setMarkdownLinkIndexBuilding] = useState(false);
  const [markdownLinkIndex, setMarkdownLinkIndex] = useState<MarkdownLinkGraphIndexSnapshot>(
    EMPTY_MARKDOWN_LINK_GRAPH_INDEX,
  );
  const [committedPreviewDocument, setCommittedPreviewDocument] = useState<CommittedPreviewDocument | null>(null);
  const lastRefreshKeyRef = useRef(refreshKey);
  const loadGenerationRef = useRef(0);
  const fileOpenTraceRef = useRef<{ id: string; documentId: string } | null>(null);
  const fileOpenCoordinatorRef = useRef<FileOpenRequestCoordinator | null>(null);
  fileOpenCoordinatorRef.current ??= new FileOpenRequestCoordinator({
    onStaleCommit: () => rendererPerformance.recordStaleCommit(),
  });
  const markdownLinkIndexCoordinatorRef = useRef<MarkdownLinkIndexCoordinator | null>(null);
  markdownLinkIndexCoordinatorRef.current ??= new MarkdownLinkIndexCoordinator();
  const suppressSelectionSyncRef = useRef(false);
  const documentNavigationRequestRef = useRef(0);
  const activePathHydrationAttemptRef = useRef<{ path: string; refreshKey: unknown } | null>(null);
  const [internalExplorerWidth, setInternalExplorerWidth] = useState(() => (
    clampNumber(defaultExplorerWidth, minExplorerWidth, maxExplorerWidth)
  ));
  const resolvedActivePath = activePath !== undefined ? activePath : internalActivePath;
  const expandedExplorerWidth = clampNumber(
    explorerWidth ?? internalExplorerWidth,
    minExplorerWidth,
    maxExplorerWidth,
  );
  const resolvedExplorerWidth = clampNumber(
    explorerCollapsed ? collapsedExplorerWidth : expandedExplorerWidth,
    collapsedExplorerWidth,
    maxExplorerWidth,
  );

  const setExplorerWidth = useCallback(
    (nextWidth: number) => {
      const clampedWidth = clampNumber(nextWidth, minExplorerWidth, maxExplorerWidth);
      if (explorerWidth === undefined) setInternalExplorerWidth(clampedWidth);
      onExplorerWidthChange?.(clampedWidth);
    },
    [explorerWidth, maxExplorerWidth, minExplorerWidth, onExplorerWidthChange],
  );

  const setFolderLoading = useCallback((folderPath: string | null, loading: boolean) => {
    const loadingKey = getLoadingKey(folderPath);
    setLoadingFolderPaths((current) => {
      if (loading && current.has(loadingKey)) return current;
      if (!loading && !current.has(loadingKey)) return current;
      const next = new Set(current);
      if (loading) next.add(loadingKey);
      else next.delete(loadingKey);
      return next;
    });
  }, []);

  const isFolderLoaded = useCallback(
    (folderPath: string | null) => (
      folderPath ? hasLoadedFolder(tree, folderPath) : rootLoaded
    ),
    [rootLoaded, tree],
  );

  const loadFolder = useCallback(
    async (folderPath: string | null, force = false) => {
      if (!force && isFolderLoaded(folderPath)) return true;

      const requestGeneration = loadGenerationRef.current;
      setFolderLoading(folderPath, true);
      setLoadError(null);

      try {
        const children = await dataPort.listChildren(folderPath);
        if (requestGeneration !== loadGenerationRef.current) return false;
        setTree((current) => attachFolderChildren(current, folderPath, children));
        if (!folderPath) setRootLoaded(true);
        return true;
      } catch (error) {
        if (requestGeneration !== loadGenerationRef.current) return false;
        setLoadError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        if (requestGeneration === loadGenerationRef.current) {
          setFolderLoading(folderPath, false);
        }
      }
    },
    [dataPort, isFolderLoaded, setFolderLoading],
  );

  useEffect(() => {
    loadGenerationRef.current += 1;
    if (fileOpenTraceRef.current) rendererPerformance.cancel(fileOpenTraceRef.current.id);
    fileOpenTraceRef.current = null;
    fileOpenCoordinatorRef.current?.cancelCurrent();
    markdownLinkIndexCoordinatorRef.current?.cancel();
    setInternalActivePath(defaultActivePath);
    setSelectedNodePaths(defaultActivePath ? new Set([defaultActivePath]) : new Set());
    setSelectionAnchorPath(defaultActivePath);
    setTree([]);
    setRootLoaded(false);
    setExpandedFolderPaths(new Set(collectAncestorFolderPaths(defaultActivePath)));
    setLoadingFolderPaths(new Set([ROOT_FOLDER_KEY]));
    setLoadError(null);
    setFileContent(null);
    setFileContentCache({});
    setFileError(null);
    setFileErrorPath(null);
    setFileLoading(false);
    setFileUrl(null);
    setFileUrlPath(null);
    setFileUrlError(null);
    setFileUrlLoading(false);
    setDocumentNavigationError(null);
    documentNavigationRequestRef.current += 1;
    setMarkdownLinkIndexing(false);
    setMarkdownLinkIndexBuilding(false);
    setMarkdownLinkIndex(EMPTY_MARKDOWN_LINK_GRAPH_INDEX);
    setCommittedPreviewDocument(null);
  }, [workspace.path, dataPort, defaultActivePath]);

  useEffect(() => {
    if (explorerWidth !== undefined) return;
    setInternalExplorerWidth(clampNumber(defaultExplorerWidth, minExplorerWidth, maxExplorerWidth));
  }, [defaultExplorerWidth, explorerWidth, maxExplorerWidth, minExplorerWidth]);

  useEffect(() => {
    let cancelled = false;
    const requestGeneration = loadGenerationRef.current;

    setFolderLoading(null, true);
    setLoadError(null);
    dataPort.listChildren(null)
      .then((children) => {
        if (cancelled || requestGeneration !== loadGenerationRef.current) return;
        setTree(children);
        setRootLoaded(true);
      })
      .catch((error) => {
        if (!cancelled && requestGeneration === loadGenerationRef.current) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled && requestGeneration === loadGenerationRef.current) {
          setFolderLoading(null, false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspace.path, dataPort, setFolderLoading]);

  useEffect(() => {
    if (refreshKey === undefined || Object.is(lastRefreshKeyRef.current, refreshKey)) {
      return undefined;
    }

    lastRefreshKeyRef.current = refreshKey;
    const loadedFolderPaths = Array.from(new Set([
      ...collectLoadedFolderPaths(tree),
      ...collectAncestorFolderPaths(resolvedActivePath),
    ])).sort((left, right) => left.split("/").length - right.split("/").length);
    let cancelled = false;
    const requestGeneration = loadGenerationRef.current;

    setFolderLoading(null, true);
    setLoadError(null);

    dataPort.listChildren(null)
      .then(async (rootChildren) => {
        const folderResults = await Promise.all(
          loadedFolderPaths.map(async (folderPath) => ({
            folderPath,
            children: await dataPort.listChildren(folderPath).catch(() => null),
          })),
        );

        if (cancelled) return;
        if (requestGeneration !== loadGenerationRef.current) return;

        let nextTree = rootChildren;
        for (const result of folderResults) {
          if (result.children) {
            nextTree = attachFolderChildren(nextTree, result.folderPath, result.children);
          }
        }
        setTree(nextTree);
        setRootLoaded(true);
      })
      .catch((error) => {
        if (!cancelled && requestGeneration === loadGenerationRef.current) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled && requestGeneration === loadGenerationRef.current) {
          setFolderLoading(null, false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataPort, refreshKey, resolvedActivePath, setFolderLoading, tree]);

  const activeNode = useMemo(() => findDataNode(tree, resolvedActivePath), [resolvedActivePath, tree]);
  const selectedNodes = useMemo(() => findDataNodes(tree, selectedNodePaths), [selectedNodePaths, tree]);
  const visibleDataNodes = useMemo(
    () => collectVisibleDataNodes(tree, expandedFolderPaths),
    [expandedFolderPaths, tree],
  );
  const currentFolderPath = activeNode?.type === "folder" ? activeNode.path : getParentPath(resolvedActivePath);
  const selectedFile = activeNode?.type !== "folder" ? activeNode : null;
  const selectedFileViewer = useMemo(() => selectedFile
    ? resolveEditorViewer({
        path: selectedFile.path,
        name: selectedFile.name,
        type: selectedFile.type,
        content: selectedFile.content,
        preview: selectedFile.preview,
        mimeType: selectedFile.mimeType,
        sourceKind: documentSourceKind ?? resolvedDocumentSourceKind,
      }).viewer
    : null, [documentSourceKind, resolvedDocumentSourceKind, selectedFile]);
  const selectedFileSourceRequirement = selectedFile ? getEditorSourceRequirement(selectedFile) : "none";
  const selectedFileNeedsFullContent = Boolean(selectedFile && dataPort.readFile && shouldReadEditorContent(selectedFile));
  const selectedFileNeedsResourceUrl = Boolean(
    selectedFile &&
    dataPort.getFileUrl &&
    (selectedFileSourceRequirement === "resource" || selectedFileSourceRequirement === "content-and-resource"),
  );
  const cachedSelectedFileContent = selectedFile ? fileContentCache[selectedFile.path] ?? null : null;
  const selectedFileContent = fileContent?.path === selectedFile?.path ? fileContent : cachedSelectedFileContent;
  const selectedFileError = fileErrorPath === selectedFile?.path ? fileError : null;
  const selectedFileContentPending = Boolean(
    selectedFileNeedsFullContent && selectedFile && !selectedFileContent && !selectedFileError,
  );
  const selectedFileUrl = fileUrlPath === selectedFile?.path ? fileUrl : null;
  const selectedFileUrlLoading = fileUrlPath === selectedFile?.path ? fileUrlLoading : false;
  const selectedFileUrlError = fileUrlPath === selectedFile?.path ? fileUrlError : null;
  const selectedPreviewDocument = useMemo<CommittedPreviewDocument | null>(() => (
    selectedFile
      ? {
          node: selectedFile,
          fileContent: selectedFileContent,
          fileUrl: selectedFileUrl,
          fileUrlLoading: selectedFileUrlLoading,
          fileUrlError: selectedFileUrlError,
          fileError: selectedFileError,
        }
      : null
  ), [selectedFile, selectedFileContent, selectedFileError, selectedFileUrl, selectedFileUrlError, selectedFileUrlLoading]);
  const renderedPreviewDocument = selectedFileContentPending && committedPreviewDocument
    ? committedPreviewDocument
    : selectedPreviewDocument;
  const renderedPreviewIsSelectedFile = renderedPreviewDocument?.node.path === selectedFile?.path;
  const renderedPreviewLoading = renderedPreviewIsSelectedFile
    ? fileLoading || selectedFileContentPending
    : selectedFileContentPending;
  const renderedPreviewError = renderedPreviewIsSelectedFile ? selectedFileError : null;
  const renderedPreviewUrlLoading = renderedPreviewIsSelectedFile
    ? selectedFileUrlLoading
    : renderedPreviewDocument?.fileUrlLoading ?? false;
  const renderedPreviewUrlError = renderedPreviewIsSelectedFile
    ? selectedFileUrlError
    : renderedPreviewDocument?.fileUrlError ?? null;
  const renderedPreviewAiEditFile = getAiEditFileForPath(aiEditRequest, renderedPreviewDocument?.node.path);
  const pathSegments = buildBreadcrumb(workspace.name, currentFolderPath, selectedFile?.name)
    .map((label) => ({ label }));
  const loadingPath = getFirstSetValue(loadingFolderPaths);
  const rootLoading = loadingFolderPaths.has(ROOT_FOLDER_KEY);
  const filesExplorerActive = !explorerSlot;

  useEffect(() => {
    if (!selectedFileViewer) return;
    // Selection owns route preloading. The currently committed preview may
    // intentionally remain on screen while a different format is read, so a
    // preload initiated by the rendered document can target the old viewer.
    // The loader cache deduplicates this with PuppyoneEditorHost and React.lazy.
    void preloadPresetViewer(selectedFileViewer).catch(() => undefined);
  }, [selectedFileViewer]);

  useEffect(() => {
    onActiveNodeChange?.(activeNode ?? null);
  }, [activeNode, onActiveNodeChange]);

  useLayoutEffect(() => {
    if (!selectedFile) return;
    if (fileOpenTraceRef.current?.documentId !== selectedFile.path) {
      const id = rendererPerformance.beginFileSelection(selectedFile.path);
      fileOpenTraceRef.current = { id, documentId: selectedFile.path };
    }
    rendererPerformance.mark(fileOpenTraceRef.current.id, "preview_shell_committed");
  }, [selectedFile]);

  useEffect(() => {
    if (suppressSelectionSyncRef.current) {
      suppressSelectionSyncRef.current = false;
      return;
    }
    if (!resolvedActivePath) {
      setSelectedNodePaths((current) => (current.size === 0 ? current : new Set()));
      setSelectionAnchorPath(null);
      return;
    }
    setSelectedNodePaths((current) => {
      if (current.has(resolvedActivePath)) return current;
      return new Set([resolvedActivePath]);
    });
    setSelectionAnchorPath(resolvedActivePath);
  }, [resolvedActivePath]);

  const requestActiveNodeChange = useCallback(async (
    node: DataNode | null,
    nextPath: string | null = node?.path ?? null,
  ): Promise<boolean> => {
    const requestId = ++documentNavigationRequestRef.current;

    try {
      if (nextPath !== resolvedActivePath) {
        // Navigation is a persistence transaction. Keep the current editor
        // mounted until every active or retiring session has durably drained.
        await flushActiveDocumentSessions("document-switch");
      }
      if (requestId !== documentNavigationRequestRef.current) return false;

      await onActivePathChange?.(nextPath, node, DRAINED_ACTIVE_PATH_CHANGE);
      if (requestId !== documentNavigationRequestRef.current) return false;

      if (activePath === undefined) setInternalActivePath(nextPath);
      setDocumentNavigationError(null);
      return true;
    } catch (error) {
      if (requestId === documentNavigationRequestRef.current) {
        setDocumentNavigationError(error instanceof Error ? error.message : String(error));
      }
      return false;
    }
  }, [activePath, onActivePathChange, resolvedActivePath]);

  const activateNode = useCallback(
    (node: DataNode | null, intent: { additive?: boolean; range?: boolean } = {}) => {
      const nextPath = node?.path ?? null;
      void requestActiveNodeChange(node).then((navigationAccepted) => {
        if (!navigationAccepted) return;
        if (node && node.type !== "folder" && fileOpenTraceRef.current?.documentId !== node.path) {
          const id = rendererPerformance.beginFileSelection(node.path);
          fileOpenTraceRef.current = { id, documentId: node.path };
        } else if (!node || node.type === "folder") {
          if (fileOpenTraceRef.current) rendererPerformance.cancel(fileOpenTraceRef.current.id);
          fileOpenTraceRef.current = null;
        }
        setSelectedNodePaths((current) => {
          if (!nextPath) return current.size === 0 ? current : new Set();
          if (intent.range) {
            const visiblePaths = visibleDataNodes.map((item) => item.path);
            const anchorPath = selectionAnchorPath && visiblePaths.includes(selectionAnchorPath)
              ? selectionAnchorPath
              : resolvedActivePath && visiblePaths.includes(resolvedActivePath)
                ? resolvedActivePath
                : nextPath;
            const rangePaths = getPathRange(visiblePaths, anchorPath, nextPath);
            if (intent.additive) return addSetValues(current, rangePaths);
            return new Set(rangePaths);
          }
          if (intent.additive) {
            const next = new Set(current);
            if (next.has(nextPath)) next.delete(nextPath);
            else next.add(nextPath);
            return next;
          }
          return new Set([nextPath]);
        });
        if (nextPath && !intent.range) setSelectionAnchorPath(nextPath);
        if (nextPath && intent.range && !selectionAnchorPath) setSelectionAnchorPath(nextPath);
        if (nextPath !== resolvedActivePath) suppressSelectionSyncRef.current = true;
        if (!node) void loadFolder(null);
      });
    },
    [loadFolder, requestActiveNodeChange, resolvedActivePath, selectionAnchorPath, visibleDataNodes],
  );
  const loadLinkedPathNode = useCallback(
    async (path: string): Promise<DataNode | null> => {
      const normalizedPath = normalizeDataPath(path);
      if (!normalizedPath) return null;

      const requestGeneration = loadGenerationRef.current;
      let workingTree = tree;

      const loadChildren = async (folderPath: string | null): Promise<DataNode[] | null> => {
        if (requestGeneration !== loadGenerationRef.current) return null;

        setFolderLoading(folderPath, true);
        setLoadError(null);

        try {
          const children = await dataPort.listChildren(folderPath);
          if (requestGeneration !== loadGenerationRef.current) return null;

          workingTree = folderPath ? attachFolderChildren(workingTree, folderPath, children) : children;
          setTree((current) => (folderPath ? attachFolderChildren(current, folderPath, children) : children));
          if (!folderPath) setRootLoaded(true);
          return children;
        } catch (error) {
          if (requestGeneration === loadGenerationRef.current) {
            setLoadError(error instanceof Error ? error.message : String(error));
          }
          return null;
        } finally {
          if (requestGeneration === loadGenerationRef.current) {
            setFolderLoading(folderPath, false);
          }
        }
      };

      if (!rootLoaded) {
        const rootChildren = await loadChildren(null);
        if (!rootChildren) return null;
      }

      const ancestorPaths = collectAncestorFolderPaths(normalizedPath);
      for (const folderPath of ancestorPaths) {
        let folder = findDataNode(workingTree, folderPath);
        if (!folder || folder.type !== "folder") return null;

        if (!Array.isArray(folder.children)) {
          const children = await loadChildren(folderPath);
          if (!children) return null;
          folder = findDataNode(workingTree, folderPath);
        }

        if (!folder || folder.type !== "folder") return null;
      }

      const node = findDataNode(workingTree, normalizedPath);
      if (node) {
        setExpandedFolderPaths((current) => addSetValues(current, ancestorPaths));
      }
      return node;
    },
    [dataPort, rootLoaded, setFolderLoading, tree],
  );

  useEffect(() => {
    if (!resolvedActivePath || activeNode) return undefined;
    const previousAttempt = activePathHydrationAttemptRef.current;
    if (previousAttempt?.path === resolvedActivePath && Object.is(previousAttempt.refreshKey, refreshKey)) {
      return undefined;
    }

    activePathHydrationAttemptRef.current = { path: resolvedActivePath, refreshKey };
    let cancelled = false;
    void loadLinkedPathNode(resolvedActivePath).then((node) => {
      if (cancelled || !node) return;
      setExpandedFolderPaths((current) => addSetValues(current, collectAncestorFolderPaths(node.path)));
    });

    return () => {
      cancelled = true;
    };
  }, [activeNode, loadLinkedPathNode, refreshKey, resolvedActivePath]);

  const openMarkdownLinkCandidates = useCallback(
    async (paths: readonly string[]) => {
      const normalizedPaths = paths
        .map(normalizeDataPath)
        .filter((path, index, allPaths): path is string => Boolean(path) && allPaths.indexOf(path) === index);

      for (const path of normalizedPaths) {
        const node = findDataNode(tree, path) ?? await loadLinkedPathNode(path);
        if (!node) continue;

        const navigationAccepted = await requestActiveNodeChange(node);
        if (!navigationAccepted) return;
        if (node.type === "folder") {
          void loadFolder(node.path);
        }
        return;
      }
    },
    [loadFolder, loadLinkedPathNode, requestActiveNodeChange, tree],
  );
  const markdownLinkWorkspaceIndex = useStableMarkdownLinkWorkspaceIndex(tree);
  const markdownLinkMetadataDocuments = markdownLinkWorkspaceIndex.metadataDocuments;
  useEffect(() => {
    const coordinator = markdownLinkIndexCoordinatorRef.current!;
    if (
      !enableMarkdownLinkContentIndexing
      || !dataPort.readFile
      || markdownLinkWorkspaceIndex.sourcePaths.length === 0
    ) {
      coordinator.cancel();
      setMarkdownLinkIndexing(false);
      setMarkdownLinkIndexBuilding(false);
      setMarkdownLinkIndex((current) => (
        current === EMPTY_MARKDOWN_LINK_GRAPH_INDEX
          ? current
          : EMPTY_MARKDOWN_LINK_GRAPH_INDEX
      ));
      return undefined;
    }

    let cancelled = false;
    const request = coordinator.buildFromReader(
      markdownLinkMetadataDocuments,
      markdownLinkWorkspaceIndex.sourcePaths.slice(0, MARKDOWN_LINK_INDEX_MAX_FILES),
      async (path, signal) => {
        const content = await dataPort.readFile?.(path, { signal });
        if (!content || typeof content.content !== "string" || !isMarkdownNodeLike(content)) return null;
        return {
          path: content.path,
          name: content.name,
          content: content.content,
        };
      },
    );
    setMarkdownLinkIndex(EMPTY_MARKDOWN_LINK_GRAPH_INDEX);
    setMarkdownLinkIndexing(true);
    setMarkdownLinkIndexBuilding(true);
    request.promise
      .then((index) => {
        if (!cancelled) setMarkdownLinkIndex(index);
      })
      .catch((error) => {
        if (!cancelled) console.warn("Unable to build Markdown link index:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setMarkdownLinkIndexing(false);
          setMarkdownLinkIndexBuilding(false);
        }
      });

    return () => {
      cancelled = true;
      request.cancel();
    };
  }, [
    dataPort,
    enableMarkdownLinkContentIndexing,
    markdownLinkMetadataDocuments,
    markdownLinkWorkspaceIndex.sourcePaths,
  ]);
  const markdownLinkGraph = useMemo(
    () => createMarkdownLinkGraph(markdownLinkMetadataDocuments, {
      isIndexing: markdownLinkIndexing || markdownLinkIndexBuilding,
      onOpenPath: (path) => {
        void openMarkdownLinkCandidates([path]);
      },
      onOpenCandidatePaths: (paths) => {
        void openMarkdownLinkCandidates(paths);
      },
      onOpenExternalUrl: (href) => {
        return onOpenExternalUrl?.(href);
      },
    }, markdownLinkIndex),
    [
      markdownLinkIndex,
      markdownLinkIndexBuilding,
      markdownLinkIndexing,
      markdownLinkMetadataDocuments,
      onOpenExternalUrl,
      openMarkdownLinkCandidates,
    ],
  );
  const markdownAssetUrlResolver = useCallback(
    async (sourcePath: string, href: string, signal?: AbortSignal) => {
      if (!dataPort.getFileUrl || signal?.aborted) return null;
      const assetPath = resolveMarkdownAssetPath(sourcePath, href);
      if (!assetPath) return null;

      try {
        const url = await dataPort.getFileUrl(assetPath, { purpose: "markdown-asset" });
        if (signal?.aborted) {
          await dataPort.revokeFileUrl?.(url);
          return null;
        }
        return {
          url,
          revoke: dataPort.revokeFileUrl
            ? () => dataPort.revokeFileUrl?.(url)
            : undefined,
        };
      } catch {
        return null;
      }
    },
    [dataPort],
  );
  const workspaceState: DataWorkspaceState = {
    tree,
    activePath: resolvedActivePath,
    activeNode,
    selectedPaths: Array.from(selectedNodePaths),
    selectedNodes,
    currentFolderPath,
    selectedFile,
    loadingPath,
    loadError,
    rootLoading,
    fileContent: selectedFileContent,
    fileLoading: fileLoading || selectedFileContentPending,
    fileError: selectedFileError,
    fileUrl: selectedFileUrl,
    fileUrlLoading: selectedFileUrlLoading,
    fileUrlError: selectedFileUrlError,
  };
  const previewAccessory = renderWorkspaceSlot(previewAccessorySlot, workspaceState);

  useEffect(() => {
    const ancestorPaths = collectAncestorFolderPaths(resolvedActivePath);
    if (ancestorPaths.length === 0) return;

    setExpandedFolderPaths((current) => addSetValues(current, ancestorPaths));
  }, [resolvedActivePath]);

  useEffect(() => {
    if (!selectedPreviewDocument) {
      setCommittedPreviewDocument(null);
      return;
    }

    if (selectedFileContentPending) return;
    setCommittedPreviewDocument(selectedPreviewDocument);
  }, [selectedPreviewDocument, selectedFileContentPending]);

  useEffect(() => {
    if (!selectedFile) {
      fileOpenCoordinatorRef.current?.cancelCurrent();
      setFileContent(null);
      setFileError(null);
      setFileErrorPath(null);
      setFileLoading(false);
      return undefined;
    }

    if (!dataPort.readFile) {
      fileOpenCoordinatorRef.current?.cancelCurrent();
      setFileContent(null);
      setFileError(null);
      setFileErrorPath(null);
      setFileLoading(false);
      return undefined;
    }

    if (!shouldReadEditorContent(selectedFile)) {
      fileOpenCoordinatorRef.current?.cancelCurrent();
      setFileContent(null);
      setFileError(null);
      setFileErrorPath(null);
      setFileLoading(false);
      return undefined;
    }

    const request = fileOpenCoordinatorRef.current!.begin(selectedFile.path);
    const trace = fileOpenTraceRef.current?.documentId === selectedFile.path
      ? fileOpenTraceRef.current
      : null;
    setFileContent(null);
    setFileLoading(true);
    setFileError(null);
    setFileErrorPath(null);
    dataPort.readFile(selectedFile.path, { signal: request.signal })
      .then((content) => {
        request.commit(() => {
          if (trace && fileOpenTraceRef.current?.id === trace.id) {
            rendererPerformance.mark(trace.id, "content_ready");
          }
          setFileContent(content);
          setFileContentCache((current) => putBoundedFileContent(current, content));
        });
      })
      .catch((error) => {
        if (!request.isCurrent() || request.signal.aborted) return;
        request.commit(() => {
          setFileContent(null);
          setFileErrorPath(selectedFile.path);
          setFileError(error instanceof Error ? error.message : String(error));
        });
      })
      .finally(() => {
        if (request.isCurrent()) setFileLoading(false);
      });

    return () => {
      request.cancel();
    };
  }, [dataPort, refreshKey, selectedFile]);

  useEffect(() => {
    if (!selectedFile || !selectedFileNeedsResourceUrl || !dataPort.getFileUrl) {
      setFileUrl(null);
      setFileUrlPath(null);
      setFileUrlError(null);
      setFileUrlLoading(false);
      return undefined;
    }

    let cancelled = false;
    let activeUrl: string | null = null;
    setFileUrl(null);
    setFileUrlPath(selectedFile.path);
    setFileUrlLoading(true);
    setFileUrlError(null);

    Promise.resolve(dataPort.getFileUrl(selectedFile.path))
      .then((url) => {
        if (cancelled) {
          void Promise.resolve(dataPort.revokeFileUrl?.(url)).catch(() => undefined);
          return;
        }
        activeUrl = url;
        setFileUrl(url);
      })
      .catch((error) => {
        if (!cancelled) {
          setFileUrl(null);
          setFileUrlPath(selectedFile.path);
          setFileUrlError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setFileUrlLoading(false);
      });

    return () => {
      cancelled = true;
      if (activeUrl) {
        void Promise.resolve(dataPort.revokeFileUrl?.(activeUrl)).catch(() => undefined);
        activeUrl = null;
      }
    };
  }, [dataPort, selectedFile, selectedFileNeedsResourceUrl]);

  const toggleFolder = useCallback(
    (node: DataNode, expanded: boolean) => {
      if (!expanded) {
        setExpandedFolderPaths((current) => deleteSetValue(current, node.path));
        return;
      }

      if (Array.isArray(node.children)) {
        setExpandedFolderPaths((current) => addSetValue(current, node.path));
        return;
      }

      if (loadingFolderPaths.has(node.path)) return;

      if (folderExpansionStrategy === "optimistic") {
        setExpandedFolderPaths((current) => addSetValue(current, node.path));
        void loadFolder(node.path).then((loaded) => {
          if (loaded) return;
          setExpandedFolderPaths((current) => deleteSetValue(current, node.path));
        });
        return;
      }

      void loadFolder(node.path).then((loaded) => {
        if (!loaded) return;
        setExpandedFolderPaths((current) => addSetValue(current, node.path));
      });
    },
    [folderExpansionStrategy, loadFolder, loadingFolderPaths],
  );

  const applyPersistedFileContent = (node: DataNode, commit: DocumentPersistedCommit) => {
    if (commit.documentId !== node.path) return;
    const existingContent = fileContent?.path === node.path
      ? fileContent
      : fileContentCache[node.path] ?? null;
    const nextContent: FileContent = existingContent
      ? { ...existingContent, content: commit.content, version: commit.version }
      : {
          path: node.path,
          name: node.name,
          type: node.type,
          content: commit.content,
          version: commit.version,
        };

    setFileContent((current) => (
      current?.path === node.path
        ? nextContent
        : current
    ));
    setFileContentCache((current) => putBoundedFileContent(current, nextContent));
    setCommittedPreviewDocument((current) => (
      current?.node.path === node.path
        ? {
            ...current,
            fileContent: nextContent,
          }
        : current
    ));
    if (enableMarkdownLinkContentIndexing && isMarkdownNodeLike(node)) {
      void markdownLinkIndexCoordinatorRef.current
        ?.updateDocument({ path: node.path, name: node.name, content: commit.content })
        .then((index) => setMarkdownLinkIndex(index))
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") return;
          console.warn("Unable to update Markdown link index:", error);
        });
    }
  };

  const importFiles = useCallback(
    async (files: File[], targetFolderPath: string | null) => {
      if (!dataPort.importFiles || files.length === 0) return;

      const requestGeneration = loadGenerationRef.current;
      setFolderLoading(targetFolderPath, true);
      setLoadError(null);

      try {
        const result = await dataPort.importFiles(files, targetFolderPath);
        const children = await dataPort.listChildren(targetFolderPath);
        if (requestGeneration !== loadGenerationRef.current) return;

        setTree((current) => attachFolderChildren(current, targetFolderPath, children));
        if (!targetFolderPath) setRootLoaded(true);
        if (targetFolderPath) {
          setExpandedFolderPaths((current) => addSetValues(current, [
            ...collectAncestorFolderPaths(targetFolderPath),
            targetFolderPath,
          ]));
        }

        const importedNode = result.paths
          .map((path) => children.find((child) => child.path === path) ?? null)
          .find((node): node is DataNode => node !== null) ?? null;
        if (!importedNode) return;

        const navigationAccepted = await requestActiveNodeChange(importedNode);
        if (!navigationAccepted) return;
        if (importedNode.type === "folder") {
          void loadFolder(importedNode.path);
        }
      } catch (error) {
        if (requestGeneration === loadGenerationRef.current) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (requestGeneration === loadGenerationRef.current) {
          setFolderLoading(targetFolderPath, false);
        }
      }
    },
    [dataPort, loadFolder, requestActiveNodeChange, setFolderLoading],
  );

  const moveNodes = useCallback(
    async (nodes: DataNode[], targetFolderPath: string | null) => {
      if (!resolvedCapabilities.move || !dataPort.moveNode) return;

      const operations = collectTopLevelNodes(nodes)
        .map((node) => {
          const previousPath = node.path;
          const nextPath = joinDataPath(targetFolderPath, node.name);
          return {
            node,
            previousPath,
            nextPath,
            previousParentPath: getParentPath(previousPath),
          };
        })
        .filter((operation) => (
          operation.previousPath !== operation.nextPath &&
          operation.previousParentPath !== targetFolderPath &&
          isValidDataMoveTarget(operation.node, targetFolderPath)
        ));

      if (operations.length === 0) return;

      setLoadError(null);

      const nextActivePath = rebasePathByMoveOperations(resolvedActivePath, operations);
      if (nextActivePath !== resolvedActivePath) {
        try {
          await flushActiveDocumentSessions("document-switch");
          setDocumentNavigationError(null);
        } catch (error) {
          setDocumentNavigationError(error instanceof Error ? error.message : String(error));
          return;
        }
      }

      try {
        for (const operation of operations) {
          await dataPort.moveNode(operation.previousPath, operation.nextPath);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : String(error));
        return;
      }

      setTree((current) => operations.reduce(
        (nextTree, operation) => moveDataNode(nextTree, operation.previousPath, operation.nextPath, targetFolderPath),
        current,
      ));
      setFileContentCache((current) => operations.reduce(
        (nextCache, operation) => rebaseFileContentCache(nextCache, operation.previousPath, operation.nextPath),
        current,
      ));
      setFileContent((current) => operations.reduce(
        (nextContent, operation) => rebaseFileContent(nextContent, operation.previousPath, operation.nextPath),
        current,
      ));
      setFileErrorPath((current) => rebasePathByMoveOperations(current, operations));
      setFileUrlPath((current) => rebasePathByMoveOperations(current, operations));
      setCommittedPreviewDocument((current) => operations.reduce(
        (nextDocument, operation) => rebaseCommittedPreviewDocument(nextDocument, operation.previousPath, operation.nextPath),
        current,
      ));
      setSelectedNodePaths((current) => rebasePathSetByMoveOperations(current, operations));
      setSelectionAnchorPath((current) => rebasePathByMoveOperations(current, operations));

      if (nextActivePath !== resolvedActivePath) {
        const nextActiveNode = activeNode
          ? operations.reduce(
            (nextNode, operation) => rebaseDataNode(nextNode, operation.previousPath, operation.nextPath),
            activeNode,
          )
          : null;
        await requestActiveNodeChange(nextActiveNode, nextActivePath);
      }

      const foldersToRefresh = new Set<string | null>(operations.map((operation) => operation.previousParentPath));
      foldersToRefresh.add(targetFolderPath);
      for (const folderPath of foldersToRefresh) {
        void loadFolder(folderPath, true);
      }
    },
    [
      activeNode,
      dataPort,
      loadFolder,
      requestActiveNodeChange,
      resolvedActivePath,
      resolvedCapabilities.move,
    ],
  );
  const moveNode = useCallback(
    (node: DataNode, targetFolderPath: string | null) => moveNodes([node], targetFolderPath),
    [moveNodes],
  );

  const beginExplorerResize = usePaneResizeDrag({
    enabled: resizableExplorer,
    bodyClassName: "data-sidebar-resizing",
    onDragStart: (event) => {
      const startX = event.clientX;
      const startWidth = explorerCollapsed ? minExplorerWidth : expandedExplorerWidth;

      if (explorerCollapsed) {
        onExplorerCollapsedChange?.(false);
      }

      return {
        onMove: (point) => {
          const physicalDelta = point.clientX - startX;
          setExplorerWidth(startWidth + (direction === "rtl" ? -physicalDelta : physicalDelta));
        },
      };
    },
  });

  const nudgeExplorerWidth = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!resizableExplorer) return;

    const step = event.shiftKey ? 24 : 12;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setExplorerWidth(resolvedExplorerWidth + (direction === "rtl" ? step : -step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setExplorerWidth(resolvedExplorerWidth + (direction === "rtl" ? -step : step));
    } else if (event.key === "Home") {
      event.preventDefault();
      setExplorerWidth(minExplorerWidth);
    } else if (event.key === "End") {
      event.preventDefault();
      setExplorerWidth(maxExplorerWidth);
    }
  };

  const dataContentStyle = resizableExplorer
    ? ({ "--data-explorer-width": `${resolvedExplorerWidth}px` } as CSSProperties)
    : undefined;

  return (
    <section className="data-workspace">
      {showHeader && (
        headerSlot ? (
          renderWorkspaceSlot(headerSlot, workspaceState)
        ) : (
          <ProjectsHeader
            pathSegments={pathSegments}
            actionSlot={renderWorkspaceSlot(headerActionSlot, workspaceState)}
          />
        )
      )}

      <div
        className="data-content"
        data-explorer-collapsed={explorerCollapsed ? "true" : undefined}
        data-resizable-explorer={resizableExplorer ? "true" : undefined}
        style={dataContentStyle}
      >
        <aside className="explorer-column">
          {!explorerCollapsed && (
            <div className="data-explorer-layout" data-has-rail={explorerRailSlot ? "true" : undefined}>
              {explorerRailSlot && (
                <div className="data-explorer-rail">
                  {renderWorkspaceSlot(explorerRailSlot, workspaceState)}
                </div>
              )}
              <div className="data-explorer-pane">
                {showExplorerToolbar && (
                  explorerToolbarSlot ? (
                    renderWorkspaceSlot(explorerToolbarSlot, workspaceState)
                  ) : (
                    <div className="desktop-explorer-toolbar">
                      <span>{labels?.root ?? t("shared-ui.explorer.root")}</span>
                      <div className="desktop-explorer-actions">
                        {resolvedCapabilities.create && onCreate && (
                          <button type="button" aria-label={t("shared-ui.explorer.create")} onClick={() => onCreate(currentFolderPath)}>
                            <Plus size={15} />
                          </button>
                        )}
                        {onMore && (
                          <button type="button" aria-label={t("shared-ui.explorer.more")} onClick={() => onMore(workspaceState)}>
                            <MoreVertical size={15} />
                          </button>
                        )}
                        {resolvedCapabilities.accessPoints && onAccess && (
                          <button type="button" aria-label={t("shared-ui.explorer.access")} onClick={() => onAccess(currentFolderPath)}>
                            <Link2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )}
                <div className="data-explorer-view-stack" data-view-mode={filesExplorerActive ? "files" : "custom"}>
                  <div
                    className="data-explorer-view-frame"
                    data-view-mode="files"
                    data-active={filesExplorerActive ? "true" : "false"}
                    aria-hidden={filesExplorerActive ? undefined : true}
                  >
                    <ExplorerTree
                      nodes={tree}
                      activePath={resolvedActivePath}
                      selectedPaths={selectedNodePaths}
                      cutPaths={explorerCutPaths}
                      currentFolderPath={currentFolderPath}
                      expandedPaths={expandedFolderPaths}
                      loadingPaths={loadingFolderPaths}
                      rootLoading={rootLoading}
                      rootError={loadError}
                      rootLabel={labels?.root ?? t("shared-ui.explorer.root")}
                      showRoot={showExplorerRoot}
                      loadingLabel={labels?.loadingWorkspace ?? t("shared-ui.explorer.loadingWorkspace")}
                      onToggleFolder={toggleFolder}
                      onSelectNode={activateNode}
                      fileIconTheme={fileIconTheme}
                      canMoveNodes={Boolean(resolvedCapabilities.move && dataPort.moveNode)}
                      onMoveNode={moveNode}
                      onMoveNodes={moveNodes}
                      onCopyNodes={resolvedCapabilities.copy && dataPort.copyNode ? onCopyNodes : undefined}
                      onCutNodes={resolvedCapabilities.move && dataPort.moveNode ? onCutNodes : undefined}
                      onPasteNodes={(resolvedCapabilities.copy && dataPort.copyNode) || (resolvedCapabilities.move && dataPort.moveNode)
                        ? onPasteNodes
                        : undefined}
                      onDuplicateNodes={resolvedCapabilities.copy && dataPort.copyNode ? onDuplicateNodes : undefined}
                      onImportFiles={dataPort.importFiles ? importFiles : undefined}
                      onRootClick={onExplorerRootClick ? (event) => onExplorerRootClick(workspaceState, event) : undefined}
                      onRootContextMenu={onExplorerRootContextMenu ? (event) => onExplorerRootContextMenu(workspaceState, event) : undefined}
                      onNodeContextMenu={onExplorerNodeContextMenu ? (node, event) => onExplorerNodeContextMenu(workspaceState, node, event) : undefined}
                      renderRootContent={explorerRootContentSlot ? () => renderWorkspaceSlot(explorerRootContentSlot, workspaceState) : undefined}
                      renderListEnd={explorerListEndSlot ? () => renderWorkspaceSlot(explorerListEndSlot, workspaceState) : undefined}
                      renderRootActions={explorerRootActionSlot ? () => renderWorkspaceSlot(explorerRootActionSlot, workspaceState) : undefined}
                      renderFolderActions={explorerFolderActionSlot ? (folder) => renderWorkspaceFolderSlot(explorerFolderActionSlot, workspaceState, folder) : undefined}
                      renderNodeActions={explorerNodeActionSlot ? (node) => renderWorkspaceNodeSlot(explorerNodeActionSlot, workspaceState, node) : undefined}
                    />
                  </div>
                  {explorerSlot && (
                    <div className="data-explorer-view-frame" data-view-mode="custom" data-active="true">
                      {renderWorkspaceSlot(explorerSlot, workspaceState)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {explorerCollapsed && (
            <div className="data-explorer-collapsed-fill" aria-hidden="true" />
          )}
          {!explorerCollapsed && explorerFooterSlot && (
            <div className="data-explorer-footer">
              {renderWorkspaceSlot(explorerFooterSlot, workspaceState)}
            </div>
          )}
          {resizableExplorer && !explorerCollapsed && (
            <div
              className="data-explorer-resizer"
              role="separator"
              aria-label={t("shared-ui.explorer.resizeSidebar")}
              aria-orientation="vertical"
              aria-valuemin={minExplorerWidth}
              aria-valuemax={maxExplorerWidth}
              aria-valuenow={resolvedExplorerWidth}
              tabIndex={0}
              onPointerDown={beginExplorerResize}
              onKeyDown={nudgeExplorerWidth}
            />
          )}
        </aside>

        {explorerCollapsed && collapsedExplorerSlot && (
          <div className="data-explorer-collapsed-slot">
            {renderWorkspaceSlot(collapsedExplorerSlot, workspaceState)}
          </div>
        )}

        <main className="browser-column desktop-editor-panel">
          {documentNavigationError && (
            <div className="editor-inline-error" role="alert" dir="auto">
              {t("editor.session.saveFailedDetail", {
                detail: bidiIsolate(documentNavigationError),
              })}
            </div>
          )}
          <div className="data-main-view-frame" data-view-mode={mainSlot ? "custom" : "files"}>
            {mainSlot ? (
              renderWorkspaceSlot(mainSlot, workspaceState)
            ) : (
              <>
                {previewAccessory && (
                  <div className="data-preview-accessory">
                    {previewAccessory}
                  </div>
                )}
                <FilePreview
                  node={renderedPreviewDocument?.node ?? null}
                  fileContent={renderedPreviewDocument?.fileContent ?? null}
                  fileUrl={renderedPreviewDocument?.fileUrl ?? null}
                  fileUrlLoading={renderedPreviewUrlLoading}
                  fileUrlError={renderedPreviewUrlError}
                  loading={renderedPreviewLoading}
                  error={renderedPreviewError}
                  aiEditFile={renderedPreviewAiEditFile}
                  showHeader={showPreviewHeader}
                  hideSourceView={hidePreviewSourceView}
                  fileIconTheme={fileIconTheme}
                  editorInteractionPreferences={editorInteractionPreferences}
                  editorSaveMode={editorSaveMode}
                  htmlTrustMode={htmlTrustMode}
                  workspaceId={workspace.id}
                  workspaceRoot={workspace.path}
                  markdownLinkGraph={markdownLinkGraph}
                  markdownAssetUrlResolver={markdownAssetUrlResolver}
                  appPreview={dataPort.appPreview ?? null}
                  openExternalFile={dataPort.openExternalFile}
                  convertOfficeDocumentToDocx={dataPort.convertOfficeDocumentToDocx}
                  viewerExtensionAdapter={viewerExtensionAdapter}
                  documentSourceKind={documentSourceKind ?? resolvedDocumentSourceKind}
                  emptySlot={emptySlot}
                  actionSlot={previewActionSlot}
                  renderBody={renderPreviewBody}
                  documentPersistence={dataPort.documentPersistence ?? null}
                  onDocumentPersisted={dataPort.documentPersistence && renderedPreviewDocument
                    ? (commit) => applyPersistedFileContent(renderedPreviewDocument.node, commit)
                    : undefined}
                />
              </>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function getFirstSetValue<T>(values: ReadonlySet<T>): T | null {
  return values.values().next().value ?? null;
}

function addSetValue<T>(current: Set<T>, value: T): Set<T> {
  if (current.has(value)) return current;
  const next = new Set(current);
  next.add(value);
  return next;
}

function addSetValues<T>(current: Set<T>, values: readonly T[]): Set<T> {
  let next: Set<T> | null = null;
  for (const value of values) {
    if (current.has(value)) continue;
    next ??= new Set(current);
    next.add(value);
  }
  return next ?? current;
}

function deleteSetValue<T>(current: Set<T>, value: T): Set<T> {
  if (!current.has(value)) return current;
  const next = new Set(current);
  next.delete(value);
  return next;
}

function findDataNode(nodes: DataNode[], path: string | null): DataNode | null {
  if (!path) return null;

  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const child = findDataNode(node.children, path);
      if (child) return child;
    }
  }

  return null;
}

function findDataNodes(nodes: DataNode[], paths: ReadonlySet<string>): DataNode[] {
  if (paths.size === 0) return [];
  const matches: DataNode[] = [];

  for (const node of nodes) {
    if (paths.has(node.path)) matches.push(node);
    if (node.children) matches.push(...findDataNodes(node.children, paths));
  }

  return matches;
}

function collectVisibleDataNodes(nodes: DataNode[], expandedPaths: ReadonlySet<string>): DataNode[] {
  const visibleNodes: DataNode[] = [];

  for (const node of nodes) {
    visibleNodes.push(node);
    if (node.type === "folder" && expandedPaths.has(node.path) && node.children) {
      visibleNodes.push(...collectVisibleDataNodes(node.children, expandedPaths));
    }
  }

  return visibleNodes;
}

function getPathRange(paths: string[], startPath: string, endPath: string): string[] {
  const startIndex = paths.indexOf(startPath);
  const endIndex = paths.indexOf(endPath);
  if (startIndex < 0 || endIndex < 0) return [endPath];
  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return paths.slice(from, to + 1);
}

function collectTopLevelNodes(nodes: DataNode[]): DataNode[] {
  return nodes.filter((node) => !nodes.some((candidate) => (
    candidate.path !== node.path && node.path.startsWith(`${candidate.path}/`)
  )));
}

function isValidDataMoveTarget(node: DataNode, targetFolderPath: string | null): boolean {
  if (getParentPath(node.path) === targetFolderPath) return false;
  if (targetFolderPath === node.path) return false;
  if (targetFolderPath?.startsWith(`${node.path}/`)) return false;
  return true;
}

function hasLoadedFolder(nodes: DataNode[], folderPath: string | null): boolean {
  if (!folderPath) return nodes.length > 0;
  const node = findDataNode(nodes, folderPath);
  return node?.type === "folder" && Array.isArray(node.children);
}

function collectLoadedFolderPaths(nodes: DataNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.type === "folder" && Array.isArray(node.children)) {
      paths.push(node.path);
      paths.push(...collectLoadedFolderPaths(node.children));
    }
  }

  return paths;
}

function attachFolderChildren(
  nodes: DataNode[],
  folderPath: string | null,
  children: DataNode[],
): DataNode[] {
  if (!folderPath) return children;

  return nodes.map((node) => {
    if (node.path === folderPath) {
      return { ...node, children };
    }
    if (node.children) {
      return {
        ...node,
        children: attachFolderChildren(node.children, folderPath, children),
      };
    }
    return node;
  });
}

function moveDataNode(
  nodes: DataNode[],
  previousPath: string,
  nextPath: string,
  targetFolderPath: string | null,
): DataNode[] {
  const removed = removeDataNode(nodes, previousPath);
  if (!removed.node) return nodes;

  return insertDataNode(
    removed.nodes,
    targetFolderPath,
    rebaseDataNode(removed.node, previousPath, nextPath),
  );
}

function removeDataNode(nodes: DataNode[], path: string): { nodes: DataNode[]; node: DataNode | null } {
  let removedNode: DataNode | null = null;
  let changed = false;
  const nextNodes: DataNode[] = [];

  for (const node of nodes) {
    if (node.path === path) {
      removedNode = node;
      changed = true;
      continue;
    }

    if (node.children && !removedNode) {
      const result = removeDataNode(node.children, path);
      if (result.node) {
        removedNode = result.node;
        changed = true;
        nextNodes.push({ ...node, children: result.nodes });
        continue;
      }
    }

    nextNodes.push(node);
  }

  return {
    nodes: changed ? nextNodes : nodes,
    node: removedNode,
  };
}

function insertDataNode(nodes: DataNode[], targetFolderPath: string | null, movedNode: DataNode): DataNode[] {
  if (!targetFolderPath) {
    return sortDataNodes([...nodes, movedNode]);
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.path === targetFolderPath && node.type === "folder") {
      if (!Array.isArray(node.children)) return node;
      changed = true;
      return {
        ...node,
        children: sortDataNodes([...node.children, movedNode]),
      };
    }

    if (node.children) {
      const nextChildren = insertDataNode(node.children, targetFolderPath, movedNode);
      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
    }

    return node;
  });

  return changed ? nextNodes : nodes;
}

function sortDataNodes(nodes: DataNode[]): DataNode[] {
  return [...nodes].sort((left, right) => {
    const leftFolder = left.type === "folder";
    const rightFolder = right.type === "folder";
    if (leftFolder !== rightFolder) return leftFolder ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

function rebaseDataNode(node: DataNode, previousPath: string, nextPath: string): DataNode {
  const rebasedPath = rebaseMovedPath(node.path, previousPath, nextPath) ?? node.path;
  return {
    ...node,
    id: node.id === node.path ? rebasedPath : node.id,
    path: rebasedPath,
    children: node.children
      ? node.children.map((child) => rebaseDataNode(child, previousPath, nextPath))
      : node.children,
  };
}

function rebaseFileContentCache(
  cache: Record<string, FileContent>,
  previousPath: string,
  nextPath: string,
): Record<string, FileContent> {
  const nextCache: Record<string, FileContent> = {};

  for (const [path, content] of Object.entries(cache)) {
    const rebasedPath = rebaseMovedPath(path, previousPath, nextPath) ?? path;
    nextCache[rebasedPath] = rebaseFileContent(content, previousPath, nextPath) ?? content;
  }

  return nextCache;
}

function rebaseFileContent(
  content: FileContent | null,
  previousPath: string,
  nextPath: string,
): FileContent | null {
  const rebasedPath = rebaseMovedPath(content?.path ?? null, previousPath, nextPath);
  return content && rebasedPath ? { ...content, path: rebasedPath } : content;
}

function rebaseCommittedPreviewDocument(
  document: CommittedPreviewDocument | null,
  previousPath: string,
  nextPath: string,
): CommittedPreviewDocument | null {
  if (!document) return null;
  const rebasedNodePath = rebaseMovedPath(document.node.path, previousPath, nextPath);
  if (!rebasedNodePath) return document;

  return {
    ...document,
    node: rebaseDataNode(document.node, previousPath, nextPath),
    fileContent: rebaseFileContent(document.fileContent, previousPath, nextPath),
  };
}

function rebaseMovedPath(path: string | null, previousPath: string, nextPath: string): string | null {
  if (!path) return path;
  if (path === previousPath) return nextPath;
  if (path.startsWith(`${previousPath}/`)) return `${nextPath}${path.slice(previousPath.length)}`;
  return path;
}

function rebasePathByMoveOperations(path: string | null, operations: readonly MoveOperation[]): string | null {
  return operations.reduce(
    (nextPath, operation) => rebaseMovedPath(nextPath, operation.previousPath, operation.nextPath),
    path,
  );
}

function rebasePathSetByMoveOperations(paths: ReadonlySet<string>, operations: readonly MoveOperation[]): Set<string> {
  const nextPaths = new Set<string>();
  for (const path of paths) {
    const nextPath = rebasePathByMoveOperations(path, operations);
    if (nextPath) nextPaths.add(nextPath);
  }
  return nextPaths;
}

function joinDataPath(folderPath: string | null, name: string): string {
  return folderPath ? `${folderPath}/${name}` : name;
}

function useStableMarkdownLinkWorkspaceIndex(nodes: DataNode[]): {
  metadataDocuments: readonly MarkdownLinkGraphDocument[];
  sourcePaths: readonly string[];
} {
  const previousRef = useRef<{
    key: string;
    metadataDocuments: readonly MarkdownLinkGraphDocument[];
    sourcePaths: readonly string[];
  } | null>(null);
  const next = useMemo(() => {
    const linkableNodes = collectLinkableNodes(nodes);
    const metadataDocuments = linkableNodes.map((node) => ({
      path: node.path,
      name: node.name,
      content: null,
    }));
    const sourcePaths = linkableNodes
      .filter(isMarkdownNodeLike)
      .map((node) => node.path);
    const key = metadataDocuments
      .map((document) => `${document.path}\u0000${document.name}`)
      .join("\u0001");
    return { key, metadataDocuments, sourcePaths };
  }, [nodes]);

  if (previousRef.current?.key !== next.key) previousRef.current = next;
  return previousRef.current;
}

function collectLinkableNodes(nodes: DataNode[]): DataNode[] {
  const linkableNodes: DataNode[] = [];

  for (const node of nodes) {
    if (node.type !== "folder") linkableNodes.push(node);
    if (node.children) linkableNodes.push(...collectLinkableNodes(node.children));
  }

  return linkableNodes;
}

function isMarkdownNodeLike(node: Pick<DataNode, "name" | "path" | "type">): boolean {
  return node.type === "markdown" || /\.(?:md|markdown)$/i.test(node.name) || /\.(?:md|markdown)$/i.test(node.path);
}

function getParentPath(path: string | null): string | null {
  if (!path || !path.includes("/")) return null;
  return path.slice(0, path.lastIndexOf("/"));
}

function normalizeDataPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
  const parts: string[] = [];

  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

function collectAncestorFolderPaths(activePath: string | null): string[] {
  if (!activePath) return [];
  const parts = activePath.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

function getLoadingKey(folderPath: string | null): string {
  return folderPath ?? ROOT_FOLDER_KEY;
}

function buildBreadcrumb(workspaceName: string, folderPath: string | null, selectedFile?: string): string[] {
  const parts = [workspaceName];
  if (folderPath) parts.push(...folderPath.split("/"));
  if (selectedFile) parts.push(selectedFile);
  return parts;
}

function renderWorkspaceSlot(slot: DataWorkspaceSlot | undefined, state: DataWorkspaceState): ReactNode {
  if (!slot) return null;
  return typeof slot === "function" ? slot(state) : slot;
}

function renderWorkspaceFolderSlot(
  slot: DataWorkspaceFolderSlot | undefined,
  state: DataWorkspaceState,
  folder: DataNode,
): ReactNode {
  if (!slot) return null;
  return typeof slot === "function" ? slot(state, folder) : slot;
}

function renderWorkspaceNodeSlot(
  slot: DataWorkspaceNodeSlot | undefined,
  state: DataWorkspaceState,
  node: DataNode,
): ReactNode {
  if (!slot) return null;
  return typeof slot === "function" ? slot(state, node) : slot;
}

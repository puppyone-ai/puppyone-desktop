import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useLocalization } from "@puppyone/localization";
import {
  DataWorkspace,
  EditorChromeContributionProvider,
  EditorFindContributionProvider,
  FilePreview,
  getAiEditFileForPath,
  getEditorPanes,
  getEditorSourceRequirement,
  shouldReadEditorContent,
  useEditorChromeContributionPublisher,
  type AiEditRequest,
  type DataNode,
  type DataPort,
  type DataWorkspaceState,
  type DocumentPersistedCommit,
  type DocumentSessionStatus,
  type EditorGroupState,
  type EditorInteractionPreferences,
  type EditorPaneLayoutLeaf,
  type EditorPaneLayoutNode,
  type EditorPaneLayoutSplit,
  type EditorPaneLayoutState,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
  type FileContent,
  type FileIconThemeId,
  type ViewerExtensionHostAdapter,
  type Workspace,
} from "@puppyone/shared-ui";
import { setNativeSurfacePointerPassthrough } from "../native-surfaces";

type DataWorkspaceProps = ComponentProps<typeof DataWorkspace>;

export type DesktopEditorSplitViewProps = Readonly<{
  aiEditRequest: AiEditRequest | null;
  dataPort: DataPort;
  editorGroup: EditorGroupState;
  editorInteractionPreferences: EditorInteractionPreferences;
  fileIconTheme: FileIconThemeId;
  layout: EditorPaneLayoutState;
  refreshKey?: unknown;
  state: DataWorkspaceState;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  workingCopyStatuses?: ReadonlyMap<string, DocumentSessionStatus>;
  workspace: Workspace;
  onCloseEditor: (editorId: string) => void;
  onClosePane: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onSplitPane: (
    paneId: string,
    direction: EditorSplitDirection,
    options?: EditorPaneSplitOptions,
  ) => void;
}>;

export function DesktopEditorSplitView({
  aiEditRequest,
  dataPort,
  editorGroup,
  editorInteractionPreferences,
  fileIconTheme,
  layout,
  refreshKey,
  state,
  viewerExtensionAdapter = null,
  workspace,
  onCloseEditor,
  onClosePane,
  onFocusPane,
  onResizeSplit,
  onSplitPane,
}: DesktopEditorSplitViewProps) {
  const editorById = useMemo(
    () => new Map(editorGroup.editors.map((editor) => [editor.id, editor])),
    [editorGroup.editors],
  );
  const paneCount = getEditorPanes(layout).length;
  const splitDrag = useSplitPaneDrag(onSplitPane);

  return (
    <div className="desktop-editor-split-view" data-pane-count={paneCount}>
      <EditorLayoutNode
        node={layout.root}
        activePaneId={layout.activePaneId}
        aiEditRequest={aiEditRequest}
        dataPort={dataPort}
        editorById={editorById}
        editorInteractionPreferences={editorInteractionPreferences}
        fileIconTheme={fileIconTheme}
        paneCount={paneCount}
        refreshKey={refreshKey}
        state={state}
        viewerExtensionAdapter={viewerExtensionAdapter}
        splitDrag={splitDrag}
        workspace={workspace}
        onCloseEditor={onCloseEditor}
        onClosePane={onClosePane}
        onFocusPane={onFocusPane}
        onResizeSplit={onResizeSplit}
        onSplitPane={onSplitPane}
      />
    </div>
  );
}

type EditorLayoutNodeProps = Omit<DesktopEditorSplitViewProps, "editorGroup" | "layout"> & Readonly<{
  activePaneId: string;
  editorById: ReadonlyMap<string, EditorGroupState["editors"][number]>;
  node: EditorPaneLayoutNode;
  paneCount: number;
  splitDrag: SplitPaneDragController;
}>;

function EditorLayoutNode(props: EditorLayoutNodeProps): ReactNode {
  if (props.node.kind === "pane") return <EditorPane {...props} pane={props.node} />;
  return <EditorSplit {...props} split={props.node} />;
}

function EditorSplit({
  node: _node,
  split,
  ...props
}: EditorLayoutNodeProps & { split: EditorPaneLayoutSplit }) {
  const style = split.direction === "horizontal"
    ? { gridTemplateColumns: `${split.ratio}fr var(--desktop-editor-splitter-size) ${1 - split.ratio}fr` }
    : { gridTemplateRows: `${split.ratio}fr var(--desktop-editor-splitter-size) ${1 - split.ratio}fr` };

  return (
    <div
      className="desktop-editor-split"
      data-direction={split.direction}
      style={style as CSSProperties}
    >
      <EditorLayoutNode {...props} node={split.first} />
      <EditorSplitResizeHandle
        direction={split.direction}
        ratio={split.ratio}
        splitId={split.id}
        onResize={props.onResizeSplit}
      />
      <EditorLayoutNode {...props} node={split.second} />
    </div>
  );
}

function EditorPane({
  activePaneId,
  aiEditRequest,
  dataPort,
  editorById,
  editorInteractionPreferences,
  fileIconTheme,
  pane,
  paneCount,
  refreshKey,
  state,
  viewerExtensionAdapter,
  workspace,
  onCloseEditor,
  onClosePane,
  onFocusPane,
  onSplitPane,
  splitDrag,
}: EditorLayoutNodeProps & { pane: EditorPaneLayoutLeaf }) {
  const { t } = useLocalization();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const active = pane.id === activePaneId;
  const editor = pane.editorId ? editorById.get(pane.editorId) ?? null : null;
  const dropEdge = splitDrag.dropIntent?.targetPaneId === pane.id
    ? splitDrag.dropIntent.edge
    : null;

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const close = (event: globalThis.PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionsOpen]);

  const splitAt = (edge: SplitDropEdge) => {
    const { direction, placement } = splitDefinitionForEdge(edge);
    onSplitPane(pane.id, direction, { editorId: pane.editorId, placement });
    setActionsOpen(false);
  };

  return (
    <section
      className="desktop-editor-pane"
      data-editor-pane-id={pane.id}
      data-active={active ? "true" : undefined}
      data-empty={editor ? undefined : "true"}
      data-drop-target={dropEdge ?? undefined}
      aria-label={editor
        ? t("editor.panes.label", { name: editor.label })
        : t("editor.panes.empty")}
      onPointerDownCapture={() => {
        if (!active) onFocusPane(pane.id);
      }}
    >
      <div className="desktop-editor-pane-handle-shell" ref={actionsRef}>
        <button
          className="desktop-editor-pane-handle"
          type="button"
          aria-label={t("editor.panes.dragToSplit")}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          title={t("editor.panes.dragToSplit")}
          onClick={() => {
            if (!splitDrag.consumeDraggedClick()) setActionsOpen((open) => !open);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            setActionsOpen(false);
            splitDrag.start(event, pane);
          }}
          onPointerMove={splitDrag.move}
          onPointerUp={splitDrag.end}
          onPointerCancel={splitDrag.cancel}
        >
          <i /><i /><i />
        </button>
        {actionsOpen && (
          <div className="desktop-editor-pane-menu" role="menu">
            <PaneMenuAction label={t("editor.panes.splitLeft")} onClick={() => splitAt("left")} />
            <PaneMenuAction label={t("editor.panes.splitRight")} onClick={() => splitAt("right")} />
            <PaneMenuAction label={t("editor.panes.splitUp")} onClick={() => splitAt("top")} />
            <PaneMenuAction label={t("editor.panes.splitDown")} onClick={() => splitAt("bottom")} />
            <span className="desktop-editor-pane-menu-divider" role="separator" />
            <PaneMenuAction
              label={paneCount > 1 ? t("editor.panes.closePane") : t("editor.panes.closeEditor")}
              disabled={!editor && paneCount === 1}
              onClick={() => {
                if (paneCount > 1) onClosePane(pane.id);
                else if (editor) onCloseEditor(editor.id);
                setActionsOpen(false);
              }}
            />
          </div>
        )}
      </div>
      <div className="desktop-editor-pane-content">
        <EditorPaneDocument
          active={active}
          aiEditRequest={aiEditRequest}
          dataPort={dataPort}
          editor={editor}
          editorInteractionPreferences={editorInteractionPreferences}
          fileIconTheme={fileIconTheme}
          refreshKey={refreshKey}
          state={state}
          viewerExtensionAdapter={viewerExtensionAdapter}
          workspace={workspace}
        />
      </div>
      {dropEdge && <div className="desktop-editor-drop-preview" data-edge={dropEdge} />}
    </section>
  );
}

function PaneMenuAction({
  disabled = false,
  label,
  onClick,
}: Readonly<{
  disabled?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      className="desktop-editor-pane-menu-action"
      role="menuitem"
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type SplitDropEdge = "left" | "right" | "top" | "bottom";

type SplitDropIntent = Readonly<{
  targetPaneId: string;
  edge: SplitDropEdge;
}>;

type SplitPaneDragController = Readonly<{
  dropIntent: SplitDropIntent | null;
  start: (event: PointerEvent<HTMLButtonElement>, pane: EditorPaneLayoutLeaf) => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  end: (event: PointerEvent<HTMLButtonElement>) => void;
  cancel: (event: PointerEvent<HTMLButtonElement>) => void;
  consumeDraggedClick: () => boolean;
}>;

type SplitDragSession = {
  handle: HTMLButtonElement;
  sourceEditorId: string | null;
  originX: number;
  originY: number;
  pointerId: number;
  dragging: boolean;
};

const SPLIT_DRAG_THRESHOLD_PX = 5;

function useSplitPaneDrag(
  onSplitPane: DesktopEditorSplitViewProps["onSplitPane"],
): SplitPaneDragController {
  const [dropIntent, setDropIntent] = useState<SplitDropIntent | null>(null);
  const sessionRef = useRef<SplitDragSession | null>(null);
  const dropIntentRef = useRef<SplitDropIntent | null>(null);
  const draggedClickRef = useRef(false);

  const publishDropIntent = useCallback((intent: SplitDropIntent | null) => {
    dropIntentRef.current = intent;
    setDropIntent(intent);
  }, []);

  const finishGesture = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (session.handle.hasPointerCapture(session.pointerId)) {
      session.handle.releasePointerCapture(session.pointerId);
    }
    sessionRef.current = null;
    publishDropIntent(null);
    document.body.classList.remove("desktop-editor-pane-dragging");
    setNativeSurfacePointerPassthrough(false);
  }, [publishDropIntent]);

  useEffect(() => {
    const cancelOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !sessionRef.current) return;
      draggedClickRef.current = sessionRef.current.dragging;
      finishGesture();
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape, true);
      finishGesture();
    };
  }, [finishGesture]);

  const start = useCallback((
    event: PointerEvent<HTMLButtonElement>,
    pane: EditorPaneLayoutLeaf,
  ) => {
    if (sessionRef.current) finishGesture();
    draggedClickRef.current = false;
    sessionRef.current = {
      handle: event.currentTarget,
      sourceEditorId: pane.editorId,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("desktop-editor-pane-dragging");
    setNativeSurfacePointerPassthrough(true);
  }, [finishGesture]);

  const move = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const distance = Math.hypot(
      event.clientX - session.originX,
      event.clientY - session.originY,
    );
    if (!session.dragging && distance < SPLIT_DRAG_THRESHOLD_PX) return;
    session.dragging = true;
    draggedClickRef.current = true;
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const target = element?.closest<HTMLElement>("[data-editor-pane-id]");
    if (!target) {
      publishDropIntent(null);
      return;
    }
    publishDropIntent({
      targetPaneId: target.dataset.editorPaneId!,
      edge: closestSplitEdge(target.getBoundingClientRect(), event.clientX, event.clientY),
    });
  }, [publishDropIntent]);

  const end = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const intent = dropIntentRef.current;
    if (session.dragging && intent) {
      const { direction, placement } = splitDefinitionForEdge(intent.edge);
      onSplitPane(intent.targetPaneId, direction, {
        editorId: session.sourceEditorId,
        placement,
      });
    }
    finishGesture();
  }, [finishGesture, onSplitPane]);

  const cancel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    draggedClickRef.current = session.dragging;
    finishGesture();
  }, [finishGesture]);

  const consumeDraggedClick = useCallback(() => {
    const dragged = draggedClickRef.current;
    draggedClickRef.current = false;
    return dragged;
  }, []);

  return useMemo(() => ({
    dropIntent,
    start,
    move,
    end,
    cancel,
    consumeDraggedClick,
  }), [cancel, consumeDraggedClick, dropIntent, end, move, start]);
}

function closestSplitEdge(rect: DOMRect, x: number, y: number): SplitDropEdge {
  const distances: ReadonlyArray<readonly [SplitDropEdge, number]> = [
    ["left", Math.abs(x - rect.left) / Math.max(1, rect.width)],
    ["right", Math.abs(rect.right - x) / Math.max(1, rect.width)],
    ["top", Math.abs(y - rect.top) / Math.max(1, rect.height)],
    ["bottom", Math.abs(rect.bottom - y) / Math.max(1, rect.height)],
  ];
  return distances.reduce((closest, candidate) => (
    candidate[1] < closest[1] ? candidate : closest
  ))[0];
}

function splitDefinitionForEdge(edge: SplitDropEdge): {
  direction: EditorSplitDirection;
  placement: NonNullable<EditorPaneSplitOptions["placement"]>;
} {
  if (edge === "left") return { direction: "horizontal", placement: "first" };
  if (edge === "right") return { direction: "horizontal", placement: "second" };
  if (edge === "top") return { direction: "vertical", placement: "first" };
  return { direction: "vertical", placement: "second" };
}

function EditorPaneDocument({
  active,
  aiEditRequest,
  dataPort,
  editor,
  editorInteractionPreferences,
  fileIconTheme,
  refreshKey,
  state,
  viewerExtensionAdapter,
  workspace,
}: Readonly<{
  active: boolean;
  aiEditRequest: AiEditRequest | null;
  dataPort: DataPort;
  editor: EditorGroupState["editors"][number] | null;
  editorInteractionPreferences: EditorInteractionPreferences;
  fileIconTheme: FileIconThemeId;
  refreshKey?: unknown;
  state: DataWorkspaceState;
  viewerExtensionAdapter?: ViewerExtensionHostAdapter | null;
  workspace: Workspace;
}>) {
  const upstreamChromePublisher = useEditorChromeContributionPublisher();
  const publishChromeContribution = useCallback(
    (contribution: Parameters<NonNullable<typeof upstreamChromePublisher>>[0]) => {
      if (active) upstreamChromePublisher?.(contribution);
    },
    [active, upstreamChromePublisher],
  );
  const treeNode = editor ? findDataNode(state.tree, editor.resource) : null;
  const fallbackNode = editor ? createFallbackNode(editor.resource, editor.label) : null;
  const source = useEditorPaneSource(treeNode ?? fallbackNode, dataPort, refreshKey);
  const node = source.content
    ? mergeNodeWithContent(treeNode ?? fallbackNode, source.content)
    : treeNode ?? fallbackNode;
  const persisted = useCallback((commit: DocumentPersistedCommit) => {
    source.applyPersistedCommit(commit);
  }, [source]);

  return (
    <EditorChromeContributionProvider onContributionChange={publishChromeContribution}>
      <EditorFindContributionProvider active={active}>
        <FilePreview
          node={node}
          fileContent={source.content}
          fileUrl={source.fileUrl}
          fileUrlLoading={source.fileUrlLoading}
          fileUrlError={source.fileUrlError}
          loading={source.loading}
          error={source.error}
          aiEditFile={getAiEditFileForPath(aiEditRequest, node?.path)}
          showHeader={false}
          hideSourceView
          fileIconTheme={fileIconTheme}
          editorInteractionPreferences={editorInteractionPreferences}
          editorSaveMode="auto"
          htmlTrustMode="safe"
          workspaceId={workspace.id}
          workspaceRoot={workspace.path}
          markdownDialect={workspace.markdownDialect ?? null}
          markdownLinkGraph={state.markdownLinkGraph}
          markdownAssetUrlResolver={state.markdownAssetUrlResolver}
          appPreview={dataPort.appPreview ?? null}
          openExternalFile={dataPort.openExternalFile}
          convertOfficeDocumentToDocx={dataPort.convertOfficeDocumentToDocx}
          viewerExtensionAdapter={viewerExtensionAdapter}
          documentSourceKind="local"
          documentPersistence={dataPort.documentPersistence ?? null}
          onDocumentPersisted={dataPort.documentPersistence && node ? persisted : undefined}
        />
      </EditorFindContributionProvider>
    </EditorChromeContributionProvider>
  );
}

function useEditorPaneSource(node: DataNode | null, dataPort: DataPort, refreshKey: unknown) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileUrlLoading, setFileUrlLoading] = useState(false);
  const [fileUrlError, setFileUrlError] = useState<string | null>(null);
  const nodePath = node?.path ?? null;
  const needsContent = Boolean(node && dataPort.readFile && shouldReadEditorContent(node));
  const sourceRequirement = node ? getEditorSourceRequirement(node) : "none";
  const needsResource = Boolean(
    node
    && dataPort.getFileUrl
    && (sourceRequirement === "resource" || sourceRequirement === "content-and-resource"),
  );

  useEffect(() => {
    setContent(null);
    setError(null);
    if (!nodePath || !needsContent || !dataPort.readFile) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    dataPort.readFile(nodePath, { signal: controller.signal })
      .then((nextContent) => {
        if (!controller.signal.aborted) setContent(nextContent);
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [dataPort, needsContent, nodePath, refreshKey]);

  useEffect(() => {
    setFileUrl(null);
    setFileUrlError(null);
    if (!nodePath || !needsResource || !dataPort.getFileUrl) {
      setFileUrlLoading(false);
      return undefined;
    }
    let cancelled = false;
    let activeUrl: string | null = null;
    setFileUrlLoading(true);
    Promise.resolve(dataPort.getFileUrl(nodePath))
      .then((url) => {
        if (cancelled) {
          void Promise.resolve(dataPort.revokeFileUrl?.(url)).catch(() => undefined);
          return;
        }
        activeUrl = url;
        setFileUrl(url);
      })
      .catch((nextError) => {
        if (!cancelled) setFileUrlError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) setFileUrlLoading(false);
      });
    return () => {
      cancelled = true;
      if (activeUrl) void Promise.resolve(dataPort.revokeFileUrl?.(activeUrl)).catch(() => undefined);
    };
  }, [dataPort, needsResource, nodePath]);

  const applyPersistedCommit = useCallback((commit: DocumentPersistedCommit) => {
    setContent((current) => {
      if (!node || commit.documentId !== node.path) return current;
      return current
        ? { ...current, content: commit.content, version: commit.version }
        : {
            path: node.path,
            name: node.name,
            type: node.type,
            content: commit.content,
            version: commit.version,
          };
    });
  }, [node]);

  return useMemo(() => ({
    content,
    loading: loading || (needsContent && !content && !error),
    error,
    fileUrl,
    fileUrlLoading,
    fileUrlError,
    applyPersistedCommit,
  }), [
    applyPersistedCommit,
    content,
    error,
    fileUrl,
    fileUrlError,
    fileUrlLoading,
    loading,
    needsContent,
  ]);
}

function EditorSplitResizeHandle({
  direction,
  ratio,
  splitId,
  onResize,
}: Readonly<{
  direction: EditorSplitDirection;
  ratio: number;
  splitId: string;
  onResize: (splitId: string, ratio: number) => void;
}>) {
  const { t } = useLocalization();
  const resizingRef = useRef(false);

  const finishResize = useCallback(() => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    setNativeSurfacePointerPassthrough(false);
  }, []);

  useEffect(() => finishResize, [finishResize]);

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const total = direction === "horizontal" ? rect.width : rect.height;
    const offset = direction === "horizontal" ? event.clientX - rect.left : event.clientY - rect.top;
    const usable = Math.max(1, total - 8);
    onResize(splitId, (offset - 4) / usable);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const decrementKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const incrementKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (event.key !== decrementKey && event.key !== incrementKey) return;
    event.preventDefault();
    onResize(splitId, ratio + (event.key === decrementKey ? -0.025 : 0.025));
  };

  return (
    <div
      className="desktop-editor-splitter"
      data-direction={direction}
      role="separator"
      tabIndex={0}
      aria-label={t("editor.panes.resize")}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(ratio * 100)}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onResize(splitId, 0.5)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (!resizingRef.current) {
          resizingRef.current = true;
          setNativeSurfacePointerPassthrough(true);
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.resizing = "true";
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        updateFromPointer(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        delete event.currentTarget.dataset.resizing;
        finishResize();
      }}
      onPointerCancel={(event) => {
        delete event.currentTarget.dataset.resizing;
        finishResize();
      }}
      onLostPointerCapture={finishResize}
    />
  );
}

function findDataNode(nodes: readonly DataNode[], path: string): DataNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const child = findDataNode(node.children, path);
      if (child) return child;
    }
  }
  return null;
}

function createFallbackNode(path: string, label: string): DataNode {
  return {
    id: path,
    name: label,
    path,
    type: "file",
    source: "local",
  };
}

function mergeNodeWithContent(node: DataNode | null, content: FileContent): DataNode {
  return {
    ...(node ?? createFallbackNode(content.path, content.name)),
    name: content.name,
    path: content.path,
    type: content.type,
    mimeType: content.mimeType,
    size: content.size,
  };
}

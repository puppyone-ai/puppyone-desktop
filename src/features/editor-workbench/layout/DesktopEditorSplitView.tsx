import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocalization } from "@puppyone/localization";
import {
  getEditorPanes,
  type AiEditRequest,
  type DataPort,
  type DataWorkspaceState,
  type EditorGroupState,
  type EditorInteractionPreferences,
  type EditorPaneLayoutLeaf,
  type EditorPaneLayoutNode,
  type EditorPaneLayoutSplit,
  type EditorPaneLayoutState,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
  type FileIconThemeId,
  type ViewerExtensionHostAdapter,
  type Workspace,
} from "@puppyone/shared-ui";
import {
  useExplorerFileDrop,
  type EditorFileDropController,
} from "../drag-and-drop/useExplorerFileDrop";
import {
  usePaneMoveDrag,
  type PaneMoveDragController,
} from "../drag-and-drop/usePaneMoveDrag";
import { EditorPaneDocument } from "./EditorPaneDocument";
import { EditorSplitResizeHandle } from "./EditorSplitResizeHandle";

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
  workspace: Workspace;
  onClosePane: (paneId: string) => void;
  onFocusPane: (paneId: string) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onMovePane: (
    sourcePaneId: string,
    targetPaneId: string,
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => void;
  onOpenAtPaneEdge: (
    path: string,
    label: string,
    targetPaneId: string,
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
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
  onClosePane,
  onFocusPane,
  onMovePane,
  onOpenAtPaneEdge,
  onResizeSplit,
}: DesktopEditorSplitViewProps) {
  const editorById = useMemo(
    () => new Map(editorGroup.editors.map((editor) => [editor.id, editor])),
    [editorGroup.editors],
  );
  const paneCount = getEditorPanes(layout).length;
  const paneMove = usePaneMoveDrag(onMovePane);
  const fileDrop = useExplorerFileDrop(workspace.id, onOpenAtPaneEdge);

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
        fileDrop={fileDrop}
        paneMove={paneMove}
        workspace={workspace}
        onClosePane={onClosePane}
        onFocusPane={onFocusPane}
        onMovePane={onMovePane}
        onOpenAtPaneEdge={onOpenAtPaneEdge}
        onResizeSplit={onResizeSplit}
      />
    </div>
  );
}

type EditorLayoutNodeProps = Omit<DesktopEditorSplitViewProps, "editorGroup" | "layout"> & Readonly<{
  activePaneId: string;
  editorById: ReadonlyMap<string, EditorGroupState["editors"][number]>;
  node: EditorPaneLayoutNode;
  paneCount: number;
  fileDrop: EditorFileDropController;
  paneMove: PaneMoveDragController;
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
  fileDrop,
  pane,
  paneCount,
  paneMove,
  refreshKey,
  state,
  viewerExtensionAdapter,
  workspace,
  onClosePane,
  onFocusPane,
}: EditorLayoutNodeProps & { pane: EditorPaneLayoutLeaf }) {
  const { t } = useLocalization();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const active = pane.id === activePaneId;
  const editor = pane.editorId ? editorById.get(pane.editorId) ?? null : null;
  const paneMoveEdge = paneMove.dropIntent?.targetPaneId === pane.id
    ? paneMove.dropIntent.edge
    : null;
  const fileDropEdge = fileDrop.dropIntent?.targetPaneId === pane.id
    ? fileDrop.dropIntent.edge
    : null;
  const dropEdge = fileDropEdge ?? paneMoveEdge;

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const close = (event: globalThis.PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionsOpen]);

  return (
    <section
      className="desktop-editor-pane"
      data-editor-pane-id={pane.id}
      data-active={active ? "true" : undefined}
      data-empty={editor ? undefined : "true"}
      data-drop-target={dropEdge ?? undefined}
      data-drop-kind={fileDropEdge ? "file" : paneMoveEdge ? "pane" : undefined}
      aria-label={editor
        ? t("editor.panes.label", { name: editor.label })
        : t("editor.panes.empty")}
      onPointerDownCapture={() => {
        if (!active) onFocusPane(pane.id);
      }}
      onDragEnterCapture={(event) => fileDrop.over(event, pane.id)}
      onDragOverCapture={(event) => fileDrop.over(event, pane.id)}
      onDragLeaveCapture={(event) => fileDrop.leave(event, pane.id)}
      onDropCapture={(event) => fileDrop.drop(event, pane.id)}
    >
      {paneCount > 1 && <div className="desktop-editor-pane-handle-shell" ref={actionsRef}>
        <button
          className="desktop-editor-pane-handle"
          type="button"
          aria-label={t("editor.panes.dragToMove")}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          title={t("editor.panes.dragToMove")}
          onClick={() => {
            if (!paneMove.consumeDraggedClick()) setActionsOpen((open) => !open);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            setActionsOpen(false);
            paneMove.start(event, pane);
          }}
          onPointerMove={paneMove.move}
          onPointerUp={paneMove.end}
          onPointerCancel={paneMove.cancel}
        >
          <i /><i /><i />
        </button>
        {actionsOpen && (
          <div className="desktop-editor-pane-menu" role="menu">
            <PaneMenuAction
              label={t("editor.panes.closePane")}
              onClick={() => {
                onClosePane(pane.id);
                setActionsOpen(false);
              }}
            />
          </div>
        )}
      </div>}
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
  label,
  onClick,
}: Readonly<{
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      className="desktop-editor-pane-menu-action"
      role="menuitem"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  getAiEditFileForPath,
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
  type WorkspaceContentChange,
} from "@puppyone/shared-ui";
import {
  useExplorerFileDrop,
  type EditorFileDropController,
} from "../drag-and-drop/useExplorerFileDrop";
import {
  usePaneMoveDrag,
  type PaneMoveDragController,
} from "../drag-and-drop/usePaneMoveDrag";
import { createEditorNodeIndex, type EditorNodeIndex } from "../runtime/editorNodeIndex";
import { EditorPaneRuntime } from "../runtime/EditorPaneRuntime";
import { EditorPaneShell } from "./EditorPaneShell";
import { EditorSplitResizeHandle } from "./EditorSplitResizeHandle";

export type DesktopEditorSplitViewProps = Readonly<{
  aiEditRequest: AiEditRequest | null;
  dataPort: DataPort;
  editorGroup: EditorGroupState;
  editorInteractionPreferences: EditorInteractionPreferences;
  fileIconTheme: FileIconThemeId;
  layout: EditorPaneLayoutState;
  refreshKey?: WorkspaceContentChange;
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
  const panes = useMemo(() => getEditorPanes(layout), [layout]);
  const editorNodeIndex = useMemo(() => createEditorNodeIndex(state.tree), [state.tree]);
  const paneCount = panes.length;
  const [openActionsPaneId, setOpenActionsPaneId] = useState<string | null>(null);
  const paneMove = usePaneMoveDrag(onMovePane);
  const fileDrop = useExplorerFileDrop(workspace.id, onOpenAtPaneEdge);

  useEffect(() => {
    if (openActionsPaneId && !panes.some((pane) => pane.id === openActionsPaneId)) {
      setOpenActionsPaneId(null);
    }
  }, [openActionsPaneId, panes]);

  useEffect(() => {
    if (paneMove.dragging) setOpenActionsPaneId(null);
  }, [paneMove.dragging]);

  return (
    <div className="desktop-editor-split-view" data-pane-count={paneCount}>
      <EditorLayoutNode
        key={layout.root.id}
        node={layout.root}
        touchesInlineStart
        activePaneId={layout.activePaneId}
        aiEditRequest={aiEditRequest}
        dataPort={dataPort}
        editorById={editorById}
        editorNodeIndex={editorNodeIndex}
        editorInteractionPreferences={editorInteractionPreferences}
        fileIconTheme={fileIconTheme}
        paneCount={paneCount}
        refreshKey={refreshKey}
        state={state}
        viewerExtensionAdapter={viewerExtensionAdapter}
        fileDrop={fileDrop}
        paneMove={paneMove}
        openActionsPaneId={openActionsPaneId}
        workspace={workspace}
        onClosePane={onClosePane}
        onFocusPane={onFocusPane}
        onMovePane={onMovePane}
        onOpenAtPaneEdge={onOpenAtPaneEdge}
        onResizeSplit={onResizeSplit}
        onOpenActionsPaneChange={setOpenActionsPaneId}
      />
    </div>
  );
}

type EditorLayoutNodeProps = Omit<DesktopEditorSplitViewProps, "editorGroup" | "layout"> & Readonly<{
  activePaneId: string;
  editorById: ReadonlyMap<string, EditorGroupState["editors"][number]>;
  editorNodeIndex: EditorNodeIndex;
  node: EditorPaneLayoutNode;
  paneCount: number;
  fileDrop: EditorFileDropController;
  paneMove: PaneMoveDragController;
  openActionsPaneId: string | null;
  touchesInlineStart: boolean;
  onOpenActionsPaneChange: (paneId: string | null) => void;
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
  const style = {
    "--desktop-editor-first-track": `${split.ratio}fr`,
    "--desktop-editor-second-track": `${1 - split.ratio}fr`,
  };

  return (
    <div
      className="desktop-editor-split"
      data-direction={split.direction}
      data-touches-inline-start={props.touchesInlineStart ? "true" : undefined}
      style={style as CSSProperties}
    >
      <EditorLayoutNode
        key={split.first.id}
        {...props}
        node={split.first}
        touchesInlineStart={props.touchesInlineStart}
      />
      <EditorSplitResizeHandle
        direction={split.direction}
        ratio={split.ratio}
        splitId={split.id}
        onCommit={props.onResizeSplit}
      />
      <EditorLayoutNode
        key={split.second.id}
        {...props}
        node={split.second}
        touchesInlineStart={split.direction === "vertical" && props.touchesInlineStart}
      />
    </div>
  );
}

function EditorPane({
  activePaneId,
  aiEditRequest,
  dataPort,
  editorById,
  editorNodeIndex,
  editorInteractionPreferences,
  fileIconTheme,
  fileDrop,
  pane,
  paneCount,
  paneMove,
  openActionsPaneId,
  refreshKey,
  state,
  viewerExtensionAdapter,
  workspace,
  onClosePane,
  onFocusPane,
  onOpenActionsPaneChange,
}: EditorLayoutNodeProps & { pane: EditorPaneLayoutLeaf }) {
  const active = pane.id === activePaneId;
  const actionsOpen = pane.id === openActionsPaneId;
  const editor = pane.editorId ? editorById.get(pane.editorId) ?? null : null;
  const treeNode = editor ? editorNodeIndex.get(editor.resource) ?? null : null;

  return (
    <EditorPaneShell
      active={active}
      actionsOpen={actionsOpen}
      editorLabel={editor?.label ?? null}
      fileDrop={fileDrop}
      pane={pane}
      paneCount={paneCount}
      paneMove={paneMove}
      onActionsPaneChange={onOpenActionsPaneChange}
      onActivate={() => {
        if (!active) onFocusPane(pane.id);
      }}
      onClose={() => onClosePane(pane.id)}
    >
      <EditorPaneRuntime
        active={active}
        aiEditFile={getAiEditFileForPath(aiEditRequest, editor?.resource) ?? null}
        dataPort={dataPort}
        editor={editor}
        editorInteractionPreferences={editorInteractionPreferences}
        fileIconTheme={fileIconTheme}
        markdownAssetUrlResolver={state.markdownAssetUrlResolver}
        markdownLinkGraph={state.markdownLinkGraph}
        refreshKey={refreshKey}
        treeNode={treeNode}
        viewerExtensionAdapter={viewerExtensionAdapter}
        workspaceId={workspace.id}
        workspaceRoot={workspace.path}
        markdownDialect={workspace.markdownDialect}
      />
    </EditorPaneShell>
  );
}

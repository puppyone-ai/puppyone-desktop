import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateEditor,
  activateEditorPane,
  assignEditorToActivePane,
  assignEditorToPane,
  closeEditor,
  closeEditorPane,
  closeEditorsUnderResource,
  createEditorInput,
  getActiveEditorPane,
  getEditorPanes,
  moveEditorPane,
  openEditor,
  rebaseEditorPaneResources,
  rebaseEditorResources,
  removeEditorFromPanes,
  splitEditorPane,
  updateEditorSplitRatio,
  type DataNode,
  type EditorGroupState,
  type EditorPaneLayoutState,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
  type Workspace,
} from "@puppyone/shared-ui";
import {
  EDITOR_WORKBENCH_STORAGE_PREFIX,
  EMPTY_EDITOR_WORKBENCH,
  LEGACY_EDITOR_GROUP_STORAGE_PREFIX,
  createEditorWorkbenchState,
  readStoredEditorWorkbench,
  type DesktopEditorWorkbenchState,
} from "../persistence/editorWorkbenchStorage";
import { EditorWorkbenchPersistenceScheduler } from "../persistence/editorWorkbenchPersistence";

export type DesktopEditorWorkbenchController = Readonly<{
  state: EditorGroupState;
  paneLayout: EditorPaneLayoutState;
  activePath: string | null;
  activePaneId: string;
  open: (path: string, node?: DataNode | null) => void;
  openAtPaneEdge: (
    path: string,
    label: string,
    targetPaneId: string,
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => void;
  activate: (editorId: string) => void;
  focusPane: (paneId: string) => void;
  movePane: (
    sourcePaneId: string,
    targetPaneId: string,
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => void;
  closePane: (paneId: string) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  close: (editorId: string) => void;
  closeUnderResource: (resource: string) => void;
  rebaseResource: (previousResource: string, nextResource: string) => void;
  clear: () => void;
}>;

export function useDesktopEditorWorkbench(workspace: Workspace | null): DesktopEditorWorkbenchController {
  const storageKey = workspace
    ? `${EDITOR_WORKBENCH_STORAGE_PREFIX}:${workspace.id}:${workspace.path}`
    : null;
  const legacyStorageKey = workspace
    ? `${LEGACY_EDITOR_GROUP_STORAGE_PREFIX}:${workspace.id}:${workspace.path}`
    : null;
  const [record, setRecord] = useState<{
    storageKey: string | null;
    workbench: DesktopEditorWorkbenchState;
  }>({ storageKey: null, workbench: EMPTY_EDITOR_WORKBENCH });
  const persistenceRef = useRef<EditorWorkbenchPersistenceScheduler | null>(null);
  persistenceRef.current ??= new EditorWorkbenchPersistenceScheduler(
    window.localStorage,
    window,
  );
  const workbench = record.storageKey === storageKey ? record.workbench : EMPTY_EDITOR_WORKBENCH;

  useEffect(() => {
    setRecord({
      storageKey,
      workbench: storageKey
        ? readStoredEditorWorkbench(storageKey, legacyStorageKey)
        : EMPTY_EDITOR_WORKBENCH,
    });
  }, [legacyStorageKey, storageKey]);

  useEffect(() => {
    if (!storageKey || record.storageKey !== storageKey) return;
    persistenceRef.current?.schedule(storageKey, record.workbench);
  }, [record, storageKey]);

  useEffect(() => {
    const flush = () => persistenceRef.current?.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const updateWorkbench = useCallback((
    update: (current: DesktopEditorWorkbenchState) => DesktopEditorWorkbenchState,
  ) => {
    setRecord((current) => {
      const currentWorkbench = current.storageKey === storageKey
        ? current.workbench
        : storageKey
          ? readStoredEditorWorkbench(storageKey, legacyStorageKey)
          : EMPTY_EDITOR_WORKBENCH;
      return { storageKey, workbench: update(currentWorkbench) };
    });
  }, [legacyStorageKey, storageKey]);

  const open = useCallback((path: string, node?: DataNode | null) => {
    if (!path || node?.type === "folder") return;
    updateWorkbench((current) => {
      const group = openEditor(current.group, createEditorInput(path, node?.name));
      const visiblePane = getEditorPanes(current.layout).find((pane) => pane.editorId === path);
      const layout = visiblePane
        ? activateEditorPane(current.layout, visiblePane.id)
        : assignEditorToActivePane(current.layout, path);
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const activate = useCallback((editorId: string) => {
    updateWorkbench((current) => {
      const group = activateEditor(current.group, editorId);
      if (group === current.group && group.activeEditorId !== editorId) return current;
      const visiblePane = getEditorPanes(current.layout).find((pane) => pane.editorId === editorId);
      const layout = visiblePane
        ? activateEditorPane(current.layout, visiblePane.id)
        : assignEditorToActivePane(current.layout, editorId);
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const openAtPaneEdge = useCallback((
    path: string,
    label: string,
    targetPaneId: string,
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => {
    if (!path) return;
    updateWorkbench((current) => {
      const visiblePane = getEditorPanes(current.layout).find((pane) => pane.editorId === path);
      const group = openEditor(current.group, createEditorInput(path, label));
      if (visiblePane) {
        return createEditorWorkbenchState(
          activateEditor(group, path),
          activateEditorPane(current.layout, visiblePane.id),
        );
      }

      const targetPane = getEditorPanes(current.layout).find((pane) => pane.id === targetPaneId);
      if (!targetPane) return current;
      const layout = targetPane.editorId === null
        ? assignEditorToPane(current.layout, targetPaneId, path)
        : splitEditorPane(current.layout, targetPaneId, direction, { editorId: path, placement });
      return createEditorWorkbenchState(activateEditor(group, path), layout);
    });
  }, [updateWorkbench]);

  const focusPane = useCallback((paneId: string) => {
    updateWorkbench((current) => {
      const layout = activateEditorPane(current.layout, paneId);
      if (layout === current.layout) return current;
      const editorId = getActiveEditorPane(layout).editorId;
      const group = editorId ? activateEditor(current.group, editorId) : current.group;
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const movePane = useCallback((
    sourcePaneId: string,
    targetPaneId: string,
    direction: EditorSplitDirection,
    placement: NonNullable<EditorPaneSplitOptions["placement"]>,
  ) => {
    updateWorkbench((current) => {
      const layout = moveEditorPane(
        current.layout,
        sourcePaneId,
        targetPaneId,
        direction,
        placement,
      );
      if (layout === current.layout) return current;
      const editorId = getActiveEditorPane(layout).editorId;
      const group = editorId ? activateEditor(current.group, editorId) : current.group;
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const closePane = useCallback((paneId: string) => {
    updateWorkbench((current) => {
      const layout = closeEditorPane(current.layout, paneId);
      if (layout === current.layout) return current;
      const editorId = getActiveEditorPane(layout).editorId;
      const group = editorId ? activateEditor(current.group, editorId) : current.group;
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    updateWorkbench((current) => {
      const layout = updateEditorSplitRatio(current.layout, splitId, ratio);
      return layout === current.layout ? current : createEditorWorkbenchState(current.group, layout);
    });
  }, [updateWorkbench]);

  const close = useCallback((editorId: string) => {
    updateWorkbench((current) => {
      const group = closeEditor(current.group, editorId);
      const layout = removeEditorFromPanes(current.layout, editorId, group.activeEditorId);
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const closeUnderResource = useCallback((resource: string) => {
    updateWorkbench((current) => {
      const removedEditorIds = current.group.editors
        .filter((editor) => isSameOrDescendant(editor.resource, resource))
        .map((editor) => editor.id);
      const group = closeEditorsUnderResource(current.group, resource);
      const layout = removedEditorIds.reduce(
        (next, editorId) => removeEditorFromPanes(next, editorId, group.activeEditorId),
        current.layout,
      );
      return createEditorWorkbenchState(group, layout);
    });
  }, [updateWorkbench]);

  const rebaseResource = useCallback((previousResource: string, nextResource: string) => {
    updateWorkbench((current) => createEditorWorkbenchState(
      rebaseEditorResources(current.group, previousResource, nextResource),
      rebaseEditorPaneResources(current.layout, previousResource, nextResource),
    ));
  }, [updateWorkbench]);

  const clear = useCallback(() => updateWorkbench(() => EMPTY_EDITOR_WORKBENCH), [updateWorkbench]);
  const activePane = getActiveEditorPane(workbench.layout);

  return useMemo(() => ({
    state: workbench.group,
    paneLayout: workbench.layout,
    activePath: activePane.editorId,
    activePaneId: activePane.id,
    open,
    openAtPaneEdge,
    activate,
    focusPane,
    movePane,
    closePane,
    resizeSplit,
    close,
    closeUnderResource,
    rebaseResource,
    clear,
  }), [
    activate,
    activePane.editorId,
    activePane.id,
    clear,
    close,
    closePane,
    closeUnderResource,
    focusPane,
    movePane,
    open,
    openAtPaneEdge,
    rebaseResource,
    resizeSplit,
    workbench.group,
    workbench.layout,
  ]);
}


function isSameOrDescendant(candidate: string, resource: string): boolean {
  return candidate === resource || candidate.startsWith(`${resource}/`);
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_EDITOR_GROUP,
  activateEditor,
  activateEditorPane,
  assignEditorToActivePane,
  assignEditorToPane,
  closeEditor,
  closeEditorPane,
  closeEditorsUnderResource,
  createEditorInput,
  createEditorPaneLayout,
  getActiveEditorPane,
  getEditorPanes,
  moveEditorPane,
  openEditor,
  parseEditorGroupState,
  parseEditorPaneLayoutState,
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

const STORAGE_PREFIX = "puppyone.desktop.editor-workbench.v2";
const LEGACY_STORAGE_PREFIX = "puppyone.desktop.editor-group.v1";

type DesktopEditorWorkbenchState = Readonly<{
  group: EditorGroupState;
  layout: EditorPaneLayoutState;
}>;

const EMPTY_EDITOR_WORKBENCH: DesktopEditorWorkbenchState = Object.freeze({
  group: EMPTY_EDITOR_GROUP,
  layout: createEditorPaneLayout(),
});

export type DesktopEditorGroupController = Readonly<{
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

export function useDesktopEditorGroup(workspace: Workspace | null): DesktopEditorGroupController {
  const storageKey = workspace ? `${STORAGE_PREFIX}:${workspace.id}:${workspace.path}` : null;
  const legacyStorageKey = workspace
    ? `${LEGACY_STORAGE_PREFIX}:${workspace.id}:${workspace.path}`
    : null;
  const [record, setRecord] = useState<{
    storageKey: string | null;
    workbench: DesktopEditorWorkbenchState;
  }>({ storageKey: null, workbench: EMPTY_EDITOR_WORKBENCH });
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
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(record.workbench));
    } catch {
      // Session restoration is best-effort and must never block editing.
    }
  }, [record, storageKey]);

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
      return freezeWorkbench(group, layout);
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
      return freezeWorkbench(group, layout);
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
        return freezeWorkbench(
          activateEditor(group, path),
          activateEditorPane(current.layout, visiblePane.id),
        );
      }

      const targetPane = getEditorPanes(current.layout).find((pane) => pane.id === targetPaneId);
      if (!targetPane) return current;
      const layout = targetPane.editorId === null
        ? assignEditorToPane(current.layout, targetPaneId, path)
        : splitEditorPane(current.layout, targetPaneId, direction, { editorId: path, placement });
      return freezeWorkbench(activateEditor(group, path), layout);
    });
  }, [updateWorkbench]);

  const focusPane = useCallback((paneId: string) => {
    updateWorkbench((current) => {
      const layout = activateEditorPane(current.layout, paneId);
      if (layout === current.layout) return current;
      const editorId = getActiveEditorPane(layout).editorId;
      const group = editorId ? activateEditor(current.group, editorId) : current.group;
      return freezeWorkbench(group, layout);
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
      return freezeWorkbench(group, layout);
    });
  }, [updateWorkbench]);

  const closePane = useCallback((paneId: string) => {
    updateWorkbench((current) => {
      const layout = closeEditorPane(current.layout, paneId);
      if (layout === current.layout) return current;
      const editorId = getActiveEditorPane(layout).editorId;
      const group = editorId ? activateEditor(current.group, editorId) : current.group;
      return freezeWorkbench(group, layout);
    });
  }, [updateWorkbench]);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    updateWorkbench((current) => {
      const layout = updateEditorSplitRatio(current.layout, splitId, ratio);
      return layout === current.layout ? current : freezeWorkbench(current.group, layout);
    });
  }, [updateWorkbench]);

  const close = useCallback((editorId: string) => {
    updateWorkbench((current) => {
      const group = closeEditor(current.group, editorId);
      const layout = removeEditorFromPanes(current.layout, editorId, group.activeEditorId);
      return freezeWorkbench(group, layout);
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
      return freezeWorkbench(group, layout);
    });
  }, [updateWorkbench]);

  const rebaseResource = useCallback((previousResource: string, nextResource: string) => {
    updateWorkbench((current) => freezeWorkbench(
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

function readStoredEditorWorkbench(
  storageKey: string,
  legacyStorageKey: string | null,
): DesktopEditorWorkbenchState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DesktopEditorWorkbenchState>;
      const group = parseEditorGroupState(parsed.group);
      const editorIds = new Set(group.editors.map(({ id }) => id));
      const layout = parseEditorPaneLayoutState(parsed.layout, editorIds, group.activeEditorId);
      const activeEditorId = getActiveEditorPane(layout).editorId;
      return freezeWorkbench(activeEditorId ? activateEditor(group, activeEditorId) : group, layout);
    }
    const legacyRaw = legacyStorageKey ? window.localStorage.getItem(legacyStorageKey) : null;
    const group = legacyRaw ? parseEditorGroupState(JSON.parse(legacyRaw)) : EMPTY_EDITOR_GROUP;
    return freezeWorkbench(group, createEditorPaneLayout(group.activeEditorId));
  } catch {
    return EMPTY_EDITOR_WORKBENCH;
  }
}

function freezeWorkbench(
  group: EditorGroupState,
  layout: EditorPaneLayoutState,
): DesktopEditorWorkbenchState {
  return Object.freeze({ group, layout });
}

function isSameOrDescendant(candidate: string, resource: string): boolean {
  return candidate === resource || candidate.startsWith(`${resource}/`);
}

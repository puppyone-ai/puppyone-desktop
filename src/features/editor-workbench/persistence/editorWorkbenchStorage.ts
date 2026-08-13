import {
  EMPTY_EDITOR_GROUP,
  activateEditor,
  closeEditorPane,
  createEditorPaneLayout,
  getActiveEditorPane,
  getEditorPanes,
  parseEditorGroupState,
  parseEditorPaneLayoutState,
  type EditorGroupState,
  type EditorPaneLayoutState,
} from "@puppyone/shared-ui";

export const EDITOR_WORKBENCH_STORAGE_PREFIX = "puppyone.desktop.editor-workbench.v2";
export const LEGACY_EDITOR_GROUP_STORAGE_PREFIX = "puppyone.desktop.editor-group.v1";

export type DesktopEditorWorkbenchState = Readonly<{
  group: EditorGroupState;
  layout: EditorPaneLayoutState;
}>;

export const EMPTY_EDITOR_WORKBENCH: DesktopEditorWorkbenchState = createEditorWorkbenchState(
  EMPTY_EDITOR_GROUP,
  createEditorPaneLayout(),
);

export function readStoredEditorWorkbench(
  storageKey: string,
  legacyStorageKey: string | null,
): DesktopEditorWorkbenchState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DesktopEditorWorkbenchState>;
      const group = parseEditorGroupState(parsed.group);
      const editorIds = new Set(group.editors.map(({ id }) => id));
      const layout = collapseDuplicateVisibleResources(
        parseEditorPaneLayoutState(parsed.layout, editorIds, group.activeEditorId),
      );
      const activeEditorId = getActiveEditorPane(layout).editorId;
      return createEditorWorkbenchState(
        activeEditorId ? activateEditor(group, activeEditorId) : group,
        layout,
      );
    }
    const legacyRaw = legacyStorageKey ? window.localStorage.getItem(legacyStorageKey) : null;
    const group = legacyRaw ? parseEditorGroupState(JSON.parse(legacyRaw)) : EMPTY_EDITOR_GROUP;
    return createEditorWorkbenchState(group, createEditorPaneLayout(group.activeEditorId));
  } catch {
    return EMPTY_EDITOR_WORKBENCH;
  }
}

export function createEditorWorkbenchState(
  group: EditorGroupState,
  layout: EditorPaneLayoutState,
): DesktopEditorWorkbenchState {
  return Object.freeze({ group, layout });
}

function collapseDuplicateVisibleResources(
  layout: EditorPaneLayoutState,
): EditorPaneLayoutState {
  const panes = getEditorPanes(layout);
  const activePane = panes.find((pane) => pane.id === layout.activePaneId);
  const orderedPanes = activePane
    ? [activePane, ...panes.filter((pane) => pane.id !== activePane.id)]
    : panes;
  const visibleResources = new Set<string>();
  const duplicatePaneIds: string[] = [];

  for (const pane of orderedPanes) {
    if (!pane.editorId) continue;
    if (visibleResources.has(pane.editorId)) duplicatePaneIds.push(pane.id);
    else visibleResources.add(pane.editorId);
  }

  return duplicatePaneIds.reduce(
    (current, paneId) => closeEditorPane(current, paneId),
    layout,
  );
}

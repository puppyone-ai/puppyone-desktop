import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_EDITOR_GROUP,
  activateEditor,
  closeEditor,
  closeEditorsUnderResource,
  createEditorInput,
  openEditor,
  parseEditorGroupState,
  rebaseEditorResources,
  type DataNode,
  type EditorGroupState,
  type Workspace,
} from "@puppyone/shared-ui";

const STORAGE_PREFIX = "puppyone.desktop.editor-group.v1";

export type DesktopEditorGroupController = Readonly<{
  state: EditorGroupState;
  activePath: string | null;
  open: (path: string, node?: DataNode | null) => void;
  activate: (editorId: string) => void;
  close: (editorId: string) => void;
  closeUnderResource: (resource: string) => void;
  rebaseResource: (previousResource: string, nextResource: string) => void;
  clear: () => void;
}>;

export function useDesktopEditorGroup(workspace: Workspace | null): DesktopEditorGroupController {
  const storageKey = workspace ? `${STORAGE_PREFIX}:${workspace.id}:${workspace.path}` : null;
  const [record, setRecord] = useState<{
    storageKey: string | null;
    state: EditorGroupState;
  }>({ storageKey: null, state: EMPTY_EDITOR_GROUP });
  const state = record.storageKey === storageKey ? record.state : EMPTY_EDITOR_GROUP;

  useEffect(() => {
    setRecord({
      storageKey,
      state: storageKey ? readStoredEditorGroup(storageKey) : EMPTY_EDITOR_GROUP,
    });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || record.storageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(record.state));
    } catch {
      // Session restoration is best-effort and must never block editing.
    }
  }, [record, storageKey]);

  const updateState = useCallback((update: (current: EditorGroupState) => EditorGroupState) => {
    setRecord((current) => {
      const currentState = current.storageKey === storageKey
        ? current.state
        : storageKey ? readStoredEditorGroup(storageKey) : EMPTY_EDITOR_GROUP;
      return { storageKey, state: update(currentState) };
    });
  }, [storageKey]);

  const open = useCallback((path: string, node?: DataNode | null) => {
    if (!path || node?.type === "folder") return;
    updateState((current) => openEditor(current, createEditorInput(path, node?.name)));
  }, [updateState]);
  const activate = useCallback((editorId: string) => {
    updateState((current) => activateEditor(current, editorId));
  }, [updateState]);
  const close = useCallback((editorId: string) => {
    updateState((current) => closeEditor(current, editorId));
  }, [updateState]);
  const closeUnderResource = useCallback((resource: string) => {
    updateState((current) => closeEditorsUnderResource(current, resource));
  }, [updateState]);
  const rebaseResource = useCallback((previousResource: string, nextResource: string) => {
    updateState((current) => rebaseEditorResources(current, previousResource, nextResource));
  }, [updateState]);
  const clear = useCallback(() => updateState(() => EMPTY_EDITOR_GROUP), [updateState]);

  return useMemo(() => ({
    state,
    activePath: state.activeEditorId,
    open,
    activate,
    close,
    closeUnderResource,
    rebaseResource,
    clear,
  }), [activate, clear, close, closeUnderResource, open, rebaseResource, state]);
}

function readStoredEditorGroup(storageKey: string): EditorGroupState {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? parseEditorGroupState(JSON.parse(raw)) : EMPTY_EDITOR_GROUP;
  } catch {
    return EMPTY_EDITOR_GROUP;
  }
}

import {
  canonicalizeResourcePath,
  isSameOrDescendantResourcePath,
  rebaseResourcePath,
} from "../../core/resourcePath";

export type EditorInput = Readonly<{
  id: string;
  resource: string;
  label: string;
}>;

export type EditorGroupState = Readonly<{
  editors: readonly EditorInput[];
  activeEditorId: string | null;
  mostRecentlyUsed: readonly string[];
}>;

export const EMPTY_EDITOR_GROUP: EditorGroupState = Object.freeze({
  editors: Object.freeze([]),
  activeEditorId: null,
  mostRecentlyUsed: Object.freeze([]),
});

export function createEditorInput(resource: string, label = basename(resource)): EditorInput {
  const canonicalResource = canonicalizeResourcePath(resource);
  return Object.freeze({
    id: canonicalResource,
    resource: canonicalResource,
    label: label || basename(canonicalResource),
  });
}

export function openEditor(
  state: EditorGroupState,
  input: EditorInput,
  options: Readonly<{ preserveFocus?: boolean }> = {},
): EditorGroupState {
  const existingIndex = state.editors.findIndex((editor) => editor.id === input.id);
  const editors = existingIndex < 0
    ? insertAfterActive(state.editors, state.activeEditorId, input)
    : state.editors.map((editor, index) => index === existingIndex ? input : editor);
  if (options.preserveFocus) return freezeState(editors, state.activeEditorId, state.mostRecentlyUsed);
  return activateEditor({ ...state, editors }, input.id);
}

export function activateEditor(state: EditorGroupState, editorId: string): EditorGroupState {
  if (!state.editors.some((editor) => editor.id === editorId)) return state;
  if (state.activeEditorId === editorId && state.mostRecentlyUsed[0] === editorId) return state;
  return freezeState(
    state.editors,
    editorId,
    [editorId, ...state.mostRecentlyUsed.filter((id) => id !== editorId)],
  );
}

export function closeEditor(state: EditorGroupState, editorId: string): EditorGroupState {
  const closingIndex = state.editors.findIndex((editor) => editor.id === editorId);
  if (closingIndex < 0) return state;
  const editors = state.editors.filter((editor) => editor.id !== editorId);
  const mru = state.mostRecentlyUsed.filter((id) => id !== editorId);
  if (state.activeEditorId !== editorId) return freezeState(editors, state.activeEditorId, mru);

  const activeEditorId = mru.find((id) => editors.some((editor) => editor.id === id))
    ?? editors[Math.min(closingIndex, editors.length - 1)]?.id
    ?? null;
  return freezeState(
    editors,
    activeEditorId,
    activeEditorId ? [activeEditorId, ...mru.filter((id) => id !== activeEditorId)] : [],
  );
}

export function closeEditorsUnderResource(
  state: EditorGroupState,
  resource: string,
): EditorGroupState {
  return state.editors
    .filter((editor) => isSameOrDescendantResourcePath(editor.resource, resource))
    .reduce((next, editor) => closeEditor(next, editor.id), state);
}

export function rebaseEditorResources(
  state: EditorGroupState,
  previousResource: string,
  nextResource: string,
): EditorGroupState {
  const canonicalNextResource = canonicalizeResourcePath(nextResource);
  const idMap = new Map<string, string>();
  const editors = state.editors.map((editor) => {
    const resource = rebaseResourcePath(editor.resource, previousResource, canonicalNextResource);
    if (resource === editor.resource) return editor;
    idMap.set(editor.id, resource);
    return createEditorInput(
      resource,
      resource === canonicalNextResource ? basename(resource) : editor.label,
    );
  });
  const mapId = (id: string) => idMap.get(id) ?? id;
  return freezeState(
    editors,
    state.activeEditorId ? mapId(state.activeEditorId) : null,
    state.mostRecentlyUsed.map(mapId),
  );
}

export function parseEditorGroupState(value: unknown): EditorGroupState {
  if (!value || typeof value !== "object") return EMPTY_EDITOR_GROUP;
  const candidate = value as Partial<EditorGroupState>;
  if (!Array.isArray(candidate.editors)) return EMPTY_EDITOR_GROUP;
  const editors = candidate.editors.flatMap((editor) => {
    if (!editor || typeof editor !== "object") return [];
    const input = editor as Partial<EditorInput>;
    if (typeof input.resource !== "string" || !input.resource.trim()) return [];
    return [createEditorInput(input.resource, typeof input.label === "string" ? input.label : undefined)];
  });
  const ids = new Set(editors.map((editor) => editor.id));
  const activeEditorId = typeof candidate.activeEditorId === "string" && ids.has(candidate.activeEditorId)
    ? candidate.activeEditorId
    : editors[0]?.id ?? null;
  const storedMru = Array.isArray(candidate.mostRecentlyUsed)
    ? candidate.mostRecentlyUsed.filter((id): id is string => typeof id === "string" && ids.has(id))
    : [];
  const mru = [...new Set([...(activeEditorId ? [activeEditorId] : []), ...storedMru, ...ids])];
  return freezeState(editors, activeEditorId, mru);
}

function insertAfterActive(
  editors: readonly EditorInput[],
  activeEditorId: string | null,
  input: EditorInput,
): readonly EditorInput[] {
  const activeIndex = activeEditorId ? editors.findIndex((editor) => editor.id === activeEditorId) : -1;
  const insertIndex = activeIndex < 0 ? editors.length : activeIndex + 1;
  return [...editors.slice(0, insertIndex), input, ...editors.slice(insertIndex)];
}

function freezeState(
  editors: readonly EditorInput[],
  activeEditorId: string | null,
  mostRecentlyUsed: readonly string[],
): EditorGroupState {
  return Object.freeze({
    editors: Object.freeze([...editors]),
    activeEditorId,
    mostRecentlyUsed: Object.freeze([...mostRecentlyUsed]),
  });
}

function basename(resource: string): string {
  return resource.split("/").filter(Boolean).at(-1) ?? resource;
}

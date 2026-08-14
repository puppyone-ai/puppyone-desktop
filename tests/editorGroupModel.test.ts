import { describe, expect, it } from "vitest";
import {
  EMPTY_EDITOR_GROUP,
  activateEditor,
  closeEditor,
  closeEditorsUnderResource,
  createEditorInput,
  openEditor,
  parseEditorGroupState,
  rebaseEditorResources,
} from "../packages/shared-ui/src/editor/workbench/editorGroupModel";

describe("EditorGroupModel", () => {
  it("opens next to the active editor and reuses matching resource identity", () => {
    let state = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    state = openEditor(state, createEditorInput("c.md"));
    state = activateEditor(state, "a.md");
    state = openEditor(state, createEditorInput("b.md"));
    state = openEditor(state, createEditorInput("a.md", "A"));

    expect(state.editors.map(({ id }) => id)).toEqual(["a.md", "b.md", "c.md"]);
    expect(state.editors[0]?.label).toBe("A");
    expect(state.activeEditorId).toBe("a.md");
  });

  it("activates the most recently used remaining editor on close", () => {
    let state = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("a.md"));
    state = openEditor(state, createEditorInput("b.md"));
    state = openEditor(state, createEditorInput("c.md"));
    state = activateEditor(state, "a.md");
    state = activateEditor(state, "c.md");

    expect(closeEditor(state, "c.md").activeEditorId).toBe("a.md");
  });

  it("rebases and closes a folder's complete editor subtree", () => {
    let state = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("docs/a.md"));
    state = openEditor(state, createEditorInput("docs/nested/b.md"));
    state = openEditor(state, createEditorInput("other.md"));
    state = rebaseEditorResources(state, "docs", "notes");

    expect(state.editors.map(({ resource }) => resource)).toEqual([
      "notes/a.md",
      "notes/nested/b.md",
      "other.md",
    ]);
    expect(closeEditorsUnderResource(state, "notes").editors.map(({ resource }) => resource))
      .toEqual(["other.md"]);
  });

  it("sanitizes persisted state instead of trusting storage", () => {
    const state = parseEditorGroupState({
      editors: [{ resource: "a.md", label: "A" }, null, { resource: "" }],
      activeEditorId: "missing.md",
      mostRecentlyUsed: ["missing.md", "a.md"],
    });

    expect(state).toMatchObject({ activeEditorId: "a.md" });
    expect(state.editors).toHaveLength(1);
    expect(state.mostRecentlyUsed).toEqual(["a.md"]);
  });
});

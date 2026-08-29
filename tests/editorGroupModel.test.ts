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
import { createWorkspaceRootUri } from "../packages/shared-ui/src/core/resourceUri";

describe("EditorGroupModel", () => {
  it("keeps identical relative paths in different Workspace Folders distinct", () => {
    const rootA = createWorkspaceRootUri("folder-a");
    const rootB = createWorkspaceRootUri("folder-b");
    let state = openEditor(EMPTY_EDITOR_GROUP, createEditorInput({
      rootUri: rootA,
      resourcePath: "src/App.tsx",
    }));
    state = openEditor(state, createEditorInput({
      rootUri: rootB,
      resourcePath: "src/App.tsx",
    }));

    expect(state.editors).toHaveLength(2);
    expect(new Set(state.editors.map(({ id }) => id)).size).toBe(2);
    expect(state.editors.map(({ resource }) => resource)).toEqual([
      "src/App.tsx",
      "src/App.tsx",
    ]);

    const onlyRootB = closeEditorsUnderResource(state, {
      rootUri: rootA,
      resourcePath: "src",
    });
    expect(onlyRootB.editors).toHaveLength(1);
    expect(onlyRootB.editors[0]?.resourceUri).toContain("folder-b");
  });

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

  it("normalizes equivalent resource addresses before identity and layout coordination", () => {
    let state = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("./docs\\a.md"));
    state = openEditor(state, createEditorInput("docs//a.md", "A"));

    expect(state.editors).toEqual([
      expect.objectContaining({ id: "docs/a.md", resource: "docs/a.md", label: "A" }),
    ]);
    expect(state.activeEditorId).toBe("docs/a.md");
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

  it("normalizes folder addresses when rebasing and closing an editor subtree", () => {
    let state = openEditor(EMPTY_EDITOR_GROUP, createEditorInput("./docs//nested/a.md"));
    state = rebaseEditorResources(state, "docs/", ".\\notes\\");

    expect(state.editors[0]).toMatchObject({ id: "notes/nested/a.md" });
    expect(closeEditorsUnderResource(state, "./notes/").editors).toHaveLength(0);
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

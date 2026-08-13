import { describe, expect, it } from "vitest";
import {
  activateEditorPane,
  assignEditorToActivePane,
  closeEditorPane,
  createEditorPaneLayout,
  getActiveEditorPane,
  getEditorPanes,
  parseEditorPaneLayoutState,
  rebaseEditorPaneResources,
  removeEditorFromPanes,
  splitEditorPane,
  updateEditorSplitRatio,
} from "../packages/shared-ui/src/editor/workbench/editorPaneLayoutModel";

describe("EditorPaneLayoutModel", () => {
  it("builds recursive right/down splits and focuses the new pane", () => {
    let layout = createEditorPaneLayout("a.md");
    layout = splitEditorPane(layout, layout.activePaneId, "horizontal");
    const secondPane = getActiveEditorPane(layout);
    layout = assignEditorToActivePane(layout, "b.md");
    layout = splitEditorPane(layout, secondPane.id, "vertical");

    expect(layout.root).toMatchObject({
      kind: "split",
      direction: "horizontal",
      second: { kind: "split", direction: "vertical" },
    });
    expect(getEditorPanes(layout).map(({ editorId }) => editorId)).toEqual([
      "a.md",
      "b.md",
      "b.md",
    ]);
    expect(getActiveEditorPane(layout).id).toBe("editor-pane-3");
  });

  it("collapses the parent split when a pane closes and preserves surviving focus", () => {
    let layout = splitEditorPane(createEditorPaneLayout("a.md"), "editor-pane-1", "horizontal");
    layout = assignEditorToActivePane(layout, "b.md");
    layout = activateEditorPane(layout, "editor-pane-1");
    layout = closeEditorPane(layout, "editor-pane-2");

    expect(layout.root).toMatchObject({ kind: "pane", id: "editor-pane-1", editorId: "a.md" });
    expect(layout.activePaneId).toBe("editor-pane-1");
  });

  it("rebases resources, removes closed editors, and clamps persisted ratios", () => {
    let layout = splitEditorPane(createEditorPaneLayout("docs/a.md"), "editor-pane-1", "horizontal");
    layout = assignEditorToActivePane(layout, "docs/b.md");
    layout = rebaseEditorPaneResources(layout, "docs", "notes");
    layout = removeEditorFromPanes(layout, "notes/b.md", "notes/a.md");
    layout = updateEditorSplitRatio(layout, "editor-split-1", 0.99);

    expect(getEditorPanes(layout).map(({ editorId }) => editorId)).toEqual(["notes/a.md", "notes/a.md"]);
    expect(layout.root).toMatchObject({ kind: "split", ratio: 0.85 });

    const parsed = parseEditorPaneLayoutState(
      { ...layout, root: { ...layout.root, ratio: -5 } },
      new Set(["notes/a.md"]),
    );
    expect(parsed.root).toMatchObject({ kind: "split", ratio: 0.15 });
  });
});

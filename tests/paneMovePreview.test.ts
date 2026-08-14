/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  PANE_MOVE_PREVIEW_CLASS,
  createPaneMovePreview,
  destroyPaneMovePreview,
  movePaneMovePreview,
} from "../src/features/editor-workbench/drag-and-drop/paneMovePreview";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pane move preview", () => {
  it("builds a scaled clone that follows the pointer and strips live pane identity", () => {
    const pane = document.createElement("section");
    pane.dataset.editorPaneId = "editor-pane-1";
    pane.id = "live-pane";
    const content = document.createElement("div");
    content.className = "desktop-editor-pane-content";
    content.id = "live-content";
    content.textContent = "Draft";
    content.getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);
    pane.append(content);
    document.body.append(pane);

    const preview = createPaneMovePreview(pane, 120, 80);
    expect(preview.className).toBe(PANE_MOVE_PREVIEW_CLASS);
    expect(preview.getAttribute("aria-hidden")).toBe("true");
    expect(preview.style.transform).toContain("120px");
    expect(preview.style.transform).toContain("80px");
    expect(preview.querySelector("[data-editor-pane-id]")).toBeNull();
    expect(preview.querySelector("#live-pane")).toBeNull();
    expect(preview.querySelector("#live-content")).toBeNull();
    expect(preview.textContent).toContain("Draft");

    movePaneMovePreview(preview, 240, 160);
    expect(preview.style.transform).toContain("240px");
    expect(preview.style.transform).toContain("160px");

    destroyPaneMovePreview(preview);
    expect(document.body.querySelector(`.${PANE_MOVE_PREVIEW_CLASS}`)).toBeNull();
  });
});

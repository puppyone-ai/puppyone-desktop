import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const splitStyles = source(
  "src/features/editor-workbench/layout/desktop-editor-split-view.css",
);
const paneChromeSource = source(
  "src/features/editor-workbench/layout/EditorPaneChrome.tsx",
);

describe("editor pane chrome hit-target architecture", () => {
  it("keeps first-gesture hit testing independent from visual reveal state", () => {
    const shellRule = readCssBlock(splitStyles, ".desktop-editor-pane-handle-shell");
    const revealRule = readCssBlock(
      splitStyles,
      ".desktop-editor-pane[data-handle-hot] > .desktop-editor-pane-handle-shell",
    );
    const handleRule = readCssBlock(splitStyles, ".desktop-editor-pane-handle");

    expect(shellRule).toContain("pointer-events: none;");
    expect(revealRule).toContain("opacity: 1;");
    expect(revealRule).not.toContain("pointer-events:");
    expect(handleRule).toContain("width: 27px;");
    expect(handleRule).toContain("height: 13px;");
    expect(handleRule).toContain("pointer-events: auto;");
  });

  it("routes both the initial press and preview warmup through the stable button", () => {
    expect(paneChromeSource).toContain("onPointerEnter={() =>");
    expect(paneChromeSource).toContain("paneMove.prepare(paneRef.current, pane.id)");
    expect(paneChromeSource).toContain("onPointerDown={(event) =>");
    expect(paneChromeSource).toContain("paneMove.start(event, pane)");
    expect(paneChromeSource).toContain("onPointerUp={(event) =>");
    expect(paneChromeSource).toContain('paneMove.end(event) === "drag"');
    expect(paneChromeSource).toContain("suppressDerivedDragClick();");
    expect(paneChromeSource).toContain("onClick={() =>");
    expect(paneChromeSource).toContain("toggleMenu();");
    expect(paneChromeSource).not.toContain("event.detail === 0");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function readCssBlock(styles: string, selector: string) {
  const exactStart = styles.indexOf(`\n${selector} {`);
  const start = exactStart >= 0 ? exactStart + 1 : styles.indexOf(selector);
  if (start < 0) return "";
  const open = styles.indexOf("{", start);
  if (open < 0) return "";
  const end = styles.indexOf("}", open);
  return end < 0 ? styles.slice(start) : styles.slice(start, end + 1);
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseCss = readFileSync(new URL("../src/styles/base.css", import.meta.url), "utf8");
const titlebarCss = readFileSync(new URL("../src/styles/titlebar.css", import.meta.url), "utf8");

describe("titlebar drag-region architecture", () => {
  it("keeps the titlebar draggable without carving out whole control groups", () => {
    const titlebar = readCssBlock(titlebarCss, ".desktop-titlebar");
    const left = readCssBlock(titlebarCss, ".desktop-titlebar-left");
    const dragFill = readCssBlock(titlebarCss, ".desktop-titlebar-drag-fill");
    const actions = readCssBlock(titlebarCss, ".desktop-titlebar-actions");

    expect(titlebar).toContain("-webkit-app-region: drag;");
    expect(dragFill).toContain("-webkit-app-region: drag;");
    expect(left).not.toContain("-webkit-app-region: no-drag;");
    expect(actions).not.toContain("-webkit-app-region: no-drag;");
  });

  it("limits no-drag regions to interactive controls and menus", () => {
    const interactiveControls = readCssBlock(
      `\n${baseCss}`,
      "button,\ninput,\ntextarea,\nselect,\na,\n[role=\"button\"]",
    );
    const menu = readCssBlock(titlebarCss, ".desktop-titlebar-menu");

    expect(interactiveControls).toContain("-webkit-app-region: no-drag;");
    expect(menu).toContain("-webkit-app-region: no-drag;");
  });
});

function readCssBlock(css: string, selector: string): string {
  const normalizedCss = css.startsWith("\n") ? css : `\n${css}`;
  const marker = `\n${selector} {`;
  const start = normalizedCss.indexOf(marker);
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = normalizedCss.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return normalizedCss.slice(bodyStart, end);
}

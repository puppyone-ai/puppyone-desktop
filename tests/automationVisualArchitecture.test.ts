import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const automationCss = readFileSync(
  new URL("../src/features/automation/automation.css", import.meta.url),
  "utf8",
);

describe("Automation landing visual architecture", () => {
  it("keeps the reference first-screen spacing rhythm", () => {
    const catalog = compact(readCssBlock(automationCss, ".desktop-cloud-automation-catalog"));
    const tabs = compact(readCssBlock(automationCss, ".desktop-cloud-automation-category-tabs"));
    const grid = compact(readCssBlock(automationCss, ".desktop-cloud-automation-template-grid"));
    const card = compact(readCssBlock(automationCss, ".desktop-cloud-automation-template-card"));

    expect(catalog).toContain("padding: 44px clamp(28px, 4.6vw, 44px) 56px;");
    expect(tabs).toContain("margin-top: 26px;");
    expect(grid).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(grid).toContain("gap: 14px;");
    expect(grid).toContain("margin-top: 11px;");
    expect(card).toContain("min-height: 156px;");
    expect(card).toContain("border-radius: 13px;");
  });

  it("derives card surfaces and text from PuppyOne theme tokens", () => {
    const card = compact(readCssBlock(automationCss, ".desktop-cloud-automation-template-card"));
    const description = compact(readCssBlock(automationCss, ".desktop-cloud-automation-template-card p"));

    expect(card).toContain("border: 1px solid var(--po-border-subtle);");
    expect(card).toContain("var(--po-panel)");
    expect(card).toContain("var(--po-canvas)");
    expect(card).toContain("color: var(--po-text);");
    expect(description).toContain("color: var(--po-text-muted);");
  });
});

function readCssBlock(css: string, selector: string): string {
  const marker = `${selector} {`;
  const lineMarker = `\n${marker}`;
  const lineStart = css.indexOf(lineMarker);
  const start = css.startsWith(marker) ? 0 : lineStart >= 0 ? lineStart + 1 : -1;
  if (start < 0) throw new Error(`Missing CSS block for ${selector}`);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  if (end < 0) throw new Error(`Unclosed CSS block for ${selector}`);
  return css.slice(bodyStart, end);
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

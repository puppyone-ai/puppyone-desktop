import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAnchoredOverlayPosition } from "../src/features/app-shell/useAnchoredOverlayPosition";

const appSource = source("src/App.tsx");
const layerSource = source("src/features/app-shell/DesktopTitlebarMenuLayer.tsx");
const projectSource = source("src/features/app-shell/DesktopWorkspaceSwitcher.tsx");
const branchSource = source("src/features/app-shell/DesktopTitlebarContext.tsx");
const titlebarCss = source("src/styles/titlebar.css");

describe("titlebar menu overlay architecture", () => {
  it("portals project and branch menus out of the clipped Header tree", () => {
    expect(layerSource).toContain("<DesktopOverlayLayer>");
    expect(layerSource).toContain("useAnchoredOverlayPosition");
    expect(layerSource).toContain('data-titlebar-context-menu="true"');
    expect(projectSource).toContain("<DesktopTitlebarMenuLayer");
    expect(branchSource).toContain("<DesktopTitlebarMenuLayer");
    expect(titlebarCss).toMatch(
      /\.desktop-titlebar-menu\.desktop-titlebar-menu-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset-inline-start:\s*auto;/s,
    );
  });

  it("keeps portal menu interactions inside the controlled open state", () => {
    expect(appSource).toContain("target.closest('[data-titlebar-context-menu=\"true\"]')");
  });

  it("fits a titlebar menu into a narrow viewport instead of clipping it", () => {
    const position = resolveAnchoredOverlayPosition({
      anchor: { top: 10, right: 288, bottom: 38, left: 238, width: 50, height: 28 },
      boundary: { top: 0, right: 300, bottom: 640, left: 0, width: 300, height: 640 },
      viewportWidth: 300,
      viewportHeight: 640,
      overlayHeight: 420,
      preferredWidth: 360,
      preferredMaxHeight: 520,
      gap: 4,
      margin: 8,
    });

    expect(position).toEqual({
      left: 8,
      top: 42,
      width: 284,
      maxHeight: 520,
      placement: "below",
    });
  });

  it("centers pane chrome overlays on their trigger and clamps them to the editor boundary", () => {
    const centered = resolveAnchoredOverlayPosition({
      anchor: { top: 20, right: 410, bottom: 33, left: 383, width: 27, height: 13 },
      boundary: { top: 0, right: 800, bottom: 600, left: 0, width: 800, height: 600 },
      viewportWidth: 800,
      viewportHeight: 600,
      overlayHeight: 36,
      preferredWidth: 196,
      preferredMaxHeight: 360,
      gap: 4,
      margin: 8,
      alignment: "center",
    });
    expect(centered.left).toBe(298.5);

    const clamped = resolveAnchoredOverlayPosition({
      anchor: { top: 20, right: 27, bottom: 33, left: 0, width: 27, height: 13 },
      boundary: { top: 0, right: 220, bottom: 600, left: 0, width: 220, height: 600 },
      viewportWidth: 800,
      viewportHeight: 600,
      overlayHeight: 36,
      preferredWidth: 196,
      preferredMaxHeight: 360,
      gap: 4,
      margin: 8,
      alignment: "center",
    });
    expect(clamped.left).toBe(8);
    expect(clamped.left + clamped.width).toBeLessThanOrEqual(212);
  });
});

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

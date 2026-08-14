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
});

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

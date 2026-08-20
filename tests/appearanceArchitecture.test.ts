import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_THEME_PRESET,
  DEFAULT_DOCK_ICON,
  DEFAULT_LIGHT_THEME_PRESET,
  DEFAULT_LOADING_ANIMATION_PRESET,
  DEFAULT_POINTER_CURSORS,
  DEFAULT_TEXT_SIZE,
  DEFAULT_THEME_MODE,
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  type SidebarNavigationLayout,
} from "../src/preferences";
import {
  APPEARANCE_PREFERENCES_SCHEMA_VERSION,
  createAppearancePreferencesV2,
  readAppearancePreferences,
  serializeAppearancePreferences,
  type LegacyAppearanceSnapshot,
} from "../src/features/appearance/appearancePreferences";
import {
  isAppearanceDecisionLocked,
  isAppearanceValueAllowed,
  resolveAppearance,
  resolveSetting,
} from "../src/features/appearance/resolveAppearance";
import { INTERFACE_STYLES } from "../src/features/appearance/interfaceStyles";
import {
  PRESET_VIEWER_MANIFEST,
} from "../packages/shared-ui/src/editor/registry/presetViewerManifest";
import {
  VIEWER_SURFACE_FAMILIES,
} from "../packages/shared-ui/src/editor/registry/viewerContract";

describe("appearance profile architecture", () => {
  it("forces XP composition without overwriting the requested navigation intent", () => {
    const requested: SidebarNavigationLayout = "left-vertical";
    const xp = resolveAppearance({
      interfaceStyle: "windows-xp",
      themeMode: "dark",
      sidebarNavigationLayout: requested,
      textSize: "large",
      fileIconTheme: "material",
      editorPresentation: "follow-interface",
    });

    expect(xp.decisions.sidebarNavigationLayout).toMatchObject({
      requestedValue: requested,
      effectiveValue: "top-horizontal",
      status: "forced",
      source: "style",
    });
    expect(xp.sidebarNavigationPlacement).toBe("top");
    expect(xp.sidebarNavigationOrientation).toBe("horizontal");
    expect(xp.themeMode).toBe("light");
    expect(xp.composition.navigation).toBe("sidebar-top-toolbar");
    expect(xp.composition.locationBar).toBe("workspace-path-v1");
    expect(xp.composition.scrollbar).toBe("windows-xp-classic-v1");

    const restored = resolveAppearance({
      interfaceStyle: "default",
      themeMode: "dark",
      sidebarNavigationLayout: requested,
      textSize: "large",
      fileIconTheme: "material",
      editorPresentation: "follow-interface",
    });
    expect(restored.sidebarNavigationLayout).toBe(requested);
    expect(restored.composition.locationBar).toBe("none");
    expect(restored.decisions.sidebarNavigationLayout.status).toBe("editable");
  });

  it("keeps allow policies editable while rejecting values outside the curated set", () => {
    const allowed = resolveSetting("large", {
      mode: "allow",
      values: ["small", "medium"],
      default: "medium",
    }, "medium");

    expect(allowed.status).toBe("constrained");
    expect(allowed.effectiveValue).toBe("medium");
    expect(isAppearanceDecisionLocked(allowed)).toBe(false);
    expect(isAppearanceValueAllowed(allowed, "small")).toBe(true);
    expect(isAppearanceValueAllowed(allowed, "large")).toBe(false);
  });

  it("describes resolved Style profiles without a runtime Style × Viewer route table", () => {
    for (const style of INTERFACE_STYLES) {
      expect(style.tokenSet).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(style.profile.family).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(style.profile.variant).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(style.profile.palette).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(style).not.toHaveProperty("surfaceAdapters");
    }
    expect(INTERFACE_STYLES.find(({ id }) => id === "default")?.stylesheet).toBeNull();
    expect(new Set(PRESET_VIEWER_MANIFEST.viewers.map(({ surfaceFamily }) => surfaceFamily)))
      .toEqual(new Set(VIEWER_SURFACE_FAMILIES));
  });

  it("keeps Editor presentation orthogonal to Style and exposes only effective data", () => {
    const xp = resolveAppearance({
      interfaceStyle: "windows-xp",
      themeMode: "light",
      sidebarNavigationLayout: "bottom-horizontal",
      textSize: "medium",
      fileIconTheme: "default",
      editorPresentation: "product-default",
    });

    expect(xp.profile).toEqual({ family: "windows-xp", variant: "luna", palette: "blue" });
    expect(xp.editorPresentation).toBe("product-default");
    expect(xp.decisions.editorPresentation.requestedValue).toBe("product-default");
    expect(xp).not.toHaveProperty("surfaceAdapters");
  });

  it("migrates legacy intent, preserves scoped options, and round-trips V2", () => {
    const legacy = legacySnapshot();
    const result = readAppearancePreferences(JSON.stringify({
      schemaVersion: 1,
      style: "windows-xp",
      navigationLayout: "left-vertical",
      themeMode: "dark",
      byStyle: { "windows-xp": { fidelity: "authentic" } },
      bySurface: { code: { fontLigatures: false } },
    }), legacy);

    expect(result.source).toBe("migrated");
    expect(result.writable).toBe(true);
    expect(result.preferences.schemaVersion).toBe(APPEARANCE_PREFERENCES_SCHEMA_VERSION);
    expect(result.preferences.activeStyle).toBe("windows-xp");
    expect(result.preferences.shared.sidebarNavigationLayout).toBe("left-vertical");
    expect(result.preferences.shared.editorPresentation).toBe("follow-interface");
    expect(result.preferences.byStyle["windows-xp"]).toEqual({ fidelity: "authentic" });
    expect(result.preferences.bySurface.code).toEqual({ fontLigatures: false });

    const serialized = serializeAppearancePreferences(result.preferences);
    const roundTrip = readAppearancePreferences(serialized, legacy);
    expect(roundTrip.source).toBe("v2");
    expect(roundTrip.preferences).toEqual(result.preferences);
  });

  it("does not authorize overwriting a newer unsupported preference document", () => {
    const result = readAppearancePreferences(JSON.stringify({
      schemaVersion: 99,
      activeStyle: "future-style",
      shared: {},
    }), legacySnapshot());

    expect(result.source).toBe("future");
    expect(result.writable).toBe(false);
    expect(result.preferences.activeStyle).toBe("default");
  });

  it("keeps Settings and Shell on the shared resolver rather than Style-ID branches", () => {
    const settings = source("src/features/settings/SettingsView.tsx");
    const preferences = source("src/features/app-shell/useDesktopPreferences.ts");
    const shell = source("src/features/app-shell/DesktopDataWorkspaceSurface.tsx");

    expect(preferences).toContain("resolveAppearance({");
    expect(settings).toContain("resolvedAppearance.decisions.sidebarNavigationLayout");
    expect(settings).toContain("resolvedAppearance.decisions.textSize");
    expect(settings).toContain("resolvedAppearance.decisions.fileIconTheme");
    expect(settings).toContain("resolvedAppearance.decisions.editorPresentation");
    expect(shell).toContain("preferences.sidebarNavigationPlacement");
    expect(settings).not.toMatch(/interfaceStyle\s*===\s*["']windows-xp["']/);
    expect(shell).not.toMatch(/interfaceStyle\s*===\s*["']windows-xp["']/);
  });

  it("loads the XP pack as modules in the dedicated cascade layer", () => {
    const cascade = source("src/styles/cascade.css");
    const generated = source("src/styles/interface-styles.generated.css");
    const entry = source("src/styles/interfaces/windows-xp/index.css");

    expect(cascade).toContain("features, interface-style, accessibility, overrides");
    expect(generated).toContain(
      '@import "./interfaces/windows-xp/index.css" layer(interface-style);',
    );
    for (const module of [
      "tokens.css",
      "shell.css",
      "controls.css",
      "settings.css",
      "features/explorer.css",
      "features/agent.css",
      "surfaces/document.css",
      "surfaces/code.css",
      "surfaces/grid.css",
      "surfaces/editable-table.css",
      "surfaces/canvas.css",
      "surfaces/media.css",
      "surfaces/embedded.css",
    ]) {
      expect(entry, module).toContain(`@import "./${module}";`);
    }
  });

  it("gates the representative visual matrix in CI", () => {
    const packageMetadata = JSON.parse(source("package.json"));
    const workflow = source(".github/workflows/ci.yml");
    const harness = source("src/features/appearance/AppearanceVisualSmokeHarness.tsx");
    const smoke = source("scripts/smoke-appearance-visual-matrix.mjs");

    expect(packageMetadata.scripts["smoke:appearance-visual"]).toBe(
      "electron scripts/smoke-appearance-visual-matrix.mjs",
    );
    expect(workflow).toContain("npm run smoke:appearance-visual");
    expect(harness).toContain('data-appearance-visual-ready="true"');
    expect(smoke).toContain('const styles = ["default", "windows-xp"]');
    for (const family of VIEWER_SURFACE_FAMILIES) expect(harness).toContain(`"${family}"`);
  });

  it("restarts the dev renderer when a Style Pack import graph changes", () => {
    const devOrchestrator = source("scripts/dev-electron.mjs");

    expect(devOrchestrator).toContain("startRendererStyleGraphWatcher()");
    expect(devOrchestrator).toContain("watchInterfaceStyleGraph(");
    expect(devOrchestrator).toContain("Interface Style import graph changed");
    expect(devOrchestrator).toContain("stopRendererStyleGraphWatcher()");
  });
});

function legacySnapshot(): LegacyAppearanceSnapshot {
  return {
    activeStyle: "default",
    themeMode: DEFAULT_THEME_MODE,
    lightThemePreset: DEFAULT_LIGHT_THEME_PRESET,
    darkThemePreset: DEFAULT_DARK_THEME_PRESET,
    textSize: DEFAULT_TEXT_SIZE,
    typography: DEFAULT_TYPOGRAPHY_PREFERENCES,
    pointerCursors: DEFAULT_POINTER_CURSORS,
    loadingAnimationPreset: DEFAULT_LOADING_ANIMATION_PRESET,
    dockIcon: DEFAULT_DOCK_ICON,
    fileIconTheme: "default",
    sidebarNavigationLayout: "bottom-horizontal",
  };
}

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

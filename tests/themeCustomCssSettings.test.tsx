// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSettingsSection } from "../src/features/settings/main/ThemeSettingsSection";
import { DEFAULT_SURFACE_THEME_PREFERENCES } from "../src/features/themes/themePreferences";
import { createThemeCatalogSnapshot } from "../src/features/themes/builtinSurfaceThemes";
import type { ThemeCatalogController } from "../src/features/themes/useThemeCatalog";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Appearance theme settings", () => {
  it("uses a long pack selector and groups the two theme actions together", async () => {
    await act(async () => {
      root.render(withTestLocalization(
        <ThemeSettingsSection
          catalog={controller({})}
          preferences={DEFAULT_SURFACE_THEME_PREFERENCES}
          onThemePackChange={vi.fn()}
        />,
      ));
      await Promise.resolve();
    });

    const controls = document.querySelector(".desktop-theme-pack-controls");
    expect(controls?.querySelector("select")).not.toBeNull();
    expect(controls?.querySelector("button")).toBeNull();
    const actions = document.querySelector(".desktop-theme-settings-actions");
    expect([...actions?.querySelectorAll("button") ?? []].map((button) => button.textContent))
      .toEqual(["Open Themes Folder", "Add Theme"]);
    expect(document.body.textContent).not.toContain(
      "Choose one coordinated theme pack for the application, Markdown, and CSV.",
    );
    expect(document.body.textContent).not.toContain("Reload Themes");
    expect(document.body.textContent).not.toContain("Advanced: Custom CSS");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reserves Add Theme until the marketplace URL is configured", async () => {
    await act(async () => {
      root.render(withTestLocalization(
        <ThemeSettingsSection
          catalog={controller({})}
          preferences={DEFAULT_SURFACE_THEME_PREFERENCES}
          onThemePackChange={vi.fn()}
        />,
      ));
      await Promise.resolve();
    });

    const addTheme = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Add Theme");
    expect(addTheme).toBeDefined();
    expect(addTheme?.disabled).toBe(true);
    expect(addTheme?.title).toContain("URL");
    expect(addTheme?.getAttribute("aria-describedby")).toBe("desktop-theme-add-status");
    expect(document.getElementById("desktop-theme-add-status")?.textContent).toContain("URL");
  });
});

function controller(overrides: Partial<ThemeCatalogController>): ThemeCatalogController {
  return {
    snapshot: createThemeCatalogSnapshot({ themes: [], diagnostics: [] }),
    selection: { application: "default", markdown: "default", csv: "default" },
    status: "ready",
    error: null,
    openDirectory: vi.fn(async () => ({ opened: true })),
    ...overrides,
  };
}

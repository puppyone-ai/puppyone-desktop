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

describe("Appearance Custom CSS settings", () => {
  it("loads, edits, saves, and applies target-scoped Custom CSS", async () => {
    const readCustomCss = vi.fn(async () => "body { color: teal }");
    const saveCustomCss = vi.fn(async () => true);
    const onCustomCssEnabledChange = vi.fn();
    const catalog = controller({ readCustomCss, saveCustomCss });

    await act(async () => {
      root.render(withTestLocalization(
        <ThemeSettingsSection
          catalog={catalog}
          preferences={DEFAULT_SURFACE_THEME_PREFERENCES}
          onThemePackChange={vi.fn()}
          onCustomCssEnabledChange={onCustomCssEnabledChange}
        />,
      ));
      await Promise.resolve();
    });

    const source = document.querySelector<HTMLTextAreaElement>(".desktop-theme-custom-css-source");
    expect(readCustomCss).toHaveBeenCalledWith("markdown");
    expect(source?.value).toBe("body { color: teal }");

    act(() => {
      if (!source) return;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        source,
        "body { color: navy }",
      );
      source.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      document.querySelector<HTMLButtonElement>(".desktop-theme-custom-css-save")?.click();
      await Promise.resolve();
    });

    expect(saveCustomCss).toHaveBeenCalledWith("markdown", "body { color: navy }");
    expect(onCustomCssEnabledChange).toHaveBeenCalledWith("markdown", true);
  });

  it("can disable Custom CSS without deleting it or changing the selected theme", async () => {
    const onCustomCssEnabledChange = vi.fn();
    const catalog = controller({ readCustomCss: vi.fn(async () => "h1 { color: teal }") });

    await act(async () => {
      root.render(withTestLocalization(
        <ThemeSettingsSection
          catalog={catalog}
          preferences={{
            ...DEFAULT_SURFACE_THEME_PREFERENCES,
            customCss: { application: false, markdown: true, csv: false },
          }}
          onThemePackChange={vi.fn()}
          onCustomCssEnabledChange={onCustomCssEnabledChange}
        />,
      ));
      await Promise.resolve();
    });

    const enabled = document.querySelector<HTMLInputElement>(
      '[aria-label="Enable Custom CSS for Markdown"]',
    );
    expect(enabled?.checked).toBe(true);
    act(() => enabled?.click());

    expect(onCustomCssEnabledChange).toHaveBeenCalledWith("markdown", false);
  });

  it("reserves Add Theme until the marketplace URL is configured", async () => {
    await act(async () => {
      root.render(withTestLocalization(
        <ThemeSettingsSection
          catalog={controller({})}
          preferences={DEFAULT_SURFACE_THEME_PREFERENCES}
          onThemePackChange={vi.fn()}
          onCustomCssEnabledChange={vi.fn()}
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
    reload: vi.fn(async () => undefined),
    openDirectory: vi.fn(async () => ({ opened: true })),
    readCustomCss: vi.fn(async () => ""),
    saveCustomCss: vi.fn(async () => true),
    ...overrides,
  };
}

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
    const onThemeOverrideChange = vi.fn();
    const catalog = controller({ readCustomCss, saveCustomCss });

    await act(async () => {
      root.render(withTestLocalization(
        <ThemeSettingsSection
          catalog={catalog}
          preferences={DEFAULT_SURFACE_THEME_PREFERENCES}
          onThemePackChange={vi.fn()}
          onThemeOverrideChange={onThemeOverrideChange}
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
    expect(onThemeOverrideChange).toHaveBeenCalledWith(
      "markdown",
      "local.puppyone.custom-css",
    );
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

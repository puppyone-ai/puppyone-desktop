// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeStyleHost } from "../src/features/themes/ThemeStyleHost";
import { createThemeCatalogSnapshot } from "../src/features/themes/builtinSurfaceThemes";
import type { ThemeDefinition } from "../src/features/themes/themeTypes";

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
  document.head.querySelectorAll("[data-po-theme-style]").forEach((element) => element.remove());
});

describe("renderer CSS theme style host", () => {
  it("merges built-ins with installed themes and injects one style per compiled target", () => {
    const installed = externalTheme({
      id: "com.example.combo",
      targets: ["markdown", "csv"],
      compiledCss: {
        markdown: '[data-po-theme-id="com.example.combo"] h1 { color: red }',
        csv: '[data-po-theme-id="com.example.combo"] th { color: blue }',
      },
    });
    const snapshot = createThemeCatalogSnapshot({ themes: [installed], diagnostics: [] });

    act(() => root.render(<ThemeStyleHost snapshot={snapshot} />));

    expect(snapshot.themes.some((theme) => theme.id === "builtin.markdown.newsprint")).toBe(true);
    const styles = [...document.head.querySelectorAll<HTMLStyleElement>("style[data-po-theme-style]")];
    expect(styles).toHaveLength(2);
    expect(styles.map((style) => style.dataset.poThemeTarget)).toEqual(["markdown", "csv"]);
    expect(styles.map((style) => style.textContent)).toEqual([
      installed.compiledCss.markdown,
      installed.compiledCss.csv,
    ]);
  });

  it("removes stale installed CSS when the catalog is reloaded", () => {
    const first = createThemeCatalogSnapshot({
      themes: [externalTheme({ id: "com.example.first" })],
      diagnostics: [],
    });
    const second = createThemeCatalogSnapshot({
      themes: [externalTheme({ id: "com.example.second" })],
      diagnostics: [],
    });
    act(() => root.render(<ThemeStyleHost snapshot={first} />));

    act(() => root.render(<ThemeStyleHost snapshot={second} />));

    expect(document.head.querySelector('[data-po-theme-id="com.example.first"]')).toBeNull();
    expect(document.head.querySelector('[data-po-theme-id="com.example.second"]')).not.toBeNull();
  });
});

function externalTheme(overrides: Partial<ThemeDefinition> = {}): ThemeDefinition {
  return {
    id: "com.example.reader",
    name: "Reader",
    version: "1.0.0",
    modes: ["light"],
    targets: ["markdown"],
    source: "local-package",
    compiledCss: {
      markdown: '[data-po-theme-id="com.example.reader"] { color: #222 }',
    },
    ...overrides,
  };
}

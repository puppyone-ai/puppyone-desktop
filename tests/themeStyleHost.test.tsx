// @vitest-environment happy-dom

import { act } from "react";
import { existsSync, readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeStyleHost } from "../src/features/themes/ThemeStyleHost";
import {
  BUILTIN_SURFACE_THEMES,
  createThemeCatalogSnapshot,
} from "../src/features/themes/builtinSurfaceThemes";
import type { ThemeDefinition } from "../src/features/themes/themeTypes";
import type { SurfaceThemeSelection } from "../src/features/themes/themePreferences";
import { DEFAULT_MARKDOWN_PRESENTATION_SETTINGS } from "../src/features/markdown/markdownPresentation";

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
  it("keeps coordinated starter packs out of the renderer bundle", () => {
    const packs = ["github", "forest", "night", "rose"];
    for (const pack of packs) {
      const id = `builtin.pack.${pack}`;
      const definition = BUILTIN_SURFACE_THEMES.find((theme) => theme.id === id);
      expect(definition).toBeUndefined();
      expect(existsSync(
        `${process.cwd()}/packages/shared-ui/src/styles/editor/theme-packs/${pack}.css`,
      )).toBe(false);
    }
    const editorCss = readFileSync(
      `${process.cwd()}/packages/shared-ui/src/styles/editor.css`,
      "utf8",
    );
    expect(editorCss).not.toContain("theme-packs.css");
  });

  it("lets scoped built-in theme tokens override editor defaults", () => {
    const defaultCss = readFileSync(
      `${process.cwd()}/packages/shared-ui/src/styles/editor/markdown-content.css`,
      "utf8",
    );
    const themeCss = readFileSync(
      `${process.cwd()}/packages/shared-ui/src/styles/editor/content-themes.css`,
      "utf8",
    );
    const styles = document.createElement("style");
    styles.dataset.testThemeCascade = "true";
    styles.textContent = `${defaultCss}\n${themeCss}`;
    document.head.append(styles);

    act(() => root.render(
      <div
        className="markdown-codemirror-editor"
        data-po-theme-surface="markdown"
        data-po-theme-id="builtin.markdown.newsprint"
      />,
    ));

    expect(getComputedStyle(container.firstElementChild as Element)
      .getPropertyValue("--po-md-content-color").trim()).toBe("#342f29");
    styles.remove();
  });

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

    act(() => root.render(
      <ThemeStyleHost
        snapshot={snapshot}
        selection={selection({ markdown: installed.id, csv: installed.id })}
        markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS}
      />,
    ));

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
    act(() => root.render(
      <ThemeStyleHost snapshot={first} selection={selection({ markdown: "com.example.first" })} markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS} />,
    ));

    act(() => root.render(
      <ThemeStyleHost snapshot={second} selection={selection({ markdown: "com.example.second" })} markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS} />,
    ));

    expect(document.head.querySelector('[data-po-theme-id="com.example.first"]')).toBeNull();
    expect(document.head.querySelector('[data-po-theme-id="com.example.second"]')).not.toBeNull();
  });

  it("does not inject installed themes that are not selected", () => {
    const snapshot = createThemeCatalogSnapshot({
      themes: [externalTheme({ id: "com.example.unselected" })],
      diagnostics: [],
    });

    act(() => root.render(
      <ThemeStyleHost snapshot={snapshot} selection={selection()} markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS} />,
    ));

    expect(document.head.querySelector("[data-po-theme-style]")).toBeNull();
  });

  it("does not apply a legacy managed Custom CSS package", () => {
    const legacyCustomCss = externalTheme({
      id: "local.puppyone.custom-css",
      compiledCss: {
        markdown: '[data-po-theme-surface="markdown"][data-po-theme-id] { color: red }',
      },
    });
    const snapshot = createThemeCatalogSnapshot({ themes: [legacyCustomCss], diagnostics: [] });

    act(() => root.render(
      <ThemeStyleHost
        snapshot={snapshot}
        selection={selection()}
        markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS}
      />,
    ));

    expect(document.head.querySelector('[data-po-theme-id="local.puppyone.custom-css"]'))
      .toBeNull();
  });

  it("injects the selected theme before Editor presentation overrides", () => {
    const base = externalTheme({
      id: "com.example.reader",
      compiledCss: {
        markdown: '[data-po-theme-surface="markdown"][data-po-theme-id="com.example.reader"] { --po-md-h1-size: 2em }',
      },
    });
    const snapshot = createThemeCatalogSnapshot({ themes: [base], diagnostics: [] });

    act(() => root.render(
      <ThemeStyleHost
        snapshot={snapshot}
        selection={selection({ markdown: base.id })}
        markdownPresentation={{
          ...DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
          headingScale: "large",
        }}
      />,
    ));

    const layers = [...document.head.querySelectorAll<HTMLStyleElement>("style[data-po-theme-style]")];
    expect(layers.map((style) => style.dataset.poThemeLayer)).toEqual([
      "theme",
      "editor",
    ]);
    expect(layers[1]?.textContent).toContain("--po-md-h1-size: 2.25em");
  });

  it("keeps Editor preferences authoritative over a dark theme root", () => {
    const base = externalTheme({
      id: "com.example.dark-reader",
      compiledCss: {
        markdown: ':where(.dark) [data-po-theme-surface="markdown"][data-po-theme-id="com.example.dark-reader"] { --po-md-h1-size: 2em }',
      },
    });
    const snapshot = createThemeCatalogSnapshot({ themes: [base], diagnostics: [] });
    const markdownPresentation = {
      ...DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
      headingScale: "large" as const,
    };

    act(() => root.render(
      <div className="dark">
        <ThemeStyleHost
          snapshot={snapshot}
          selection={selection({ markdown: base.id })}
          markdownPresentation={markdownPresentation}
        />
        <div data-dark-cascade data-po-theme-surface="markdown" data-po-theme-id={base.id} />
      </div>,
    ));
    const surface = container.querySelector("[data-dark-cascade]") as Element;
    expect(getComputedStyle(surface).getPropertyValue("--po-md-h1-size").trim()).toBe("2.25em");
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

function selection(
  overrides: Partial<SurfaceThemeSelection> = {},
): SurfaceThemeSelection {
  return {
    application: "default",
    markdown: "default",
    csv: "default",
    ...overrides,
  };
}

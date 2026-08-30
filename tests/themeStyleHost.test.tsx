// @vitest-environment happy-dom

import { act } from "react";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/styles/github.css?raw", () => ({
  default: '[data-po-appearance-root][data-sub-theme-id="default.github"] { --po-host-md-content-color: #24292f; }',
}));
vi.mock("../src/styles/newspaper.css?raw", () => ({
  default: '[data-po-appearance-root][data-sub-theme-id="default.newspaper"] { --po-host-md-content-color: #342f29; }',
}));

import { SubThemeStyleHost } from "../src/features/themes/SubThemeStyleHost";
import {
  BUILTIN_SUB_THEMES,
  createSubThemeCatalogSnapshot,
} from "../src/features/themes/builtinSubThemes";
import type { SubThemeDefinition } from "../src/features/themes/themeTypes";
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
  document.head.querySelectorAll("[data-po-sub-theme-style]").forEach((element) => element.remove());
});

describe("renderer Sub Theme style host", () => {
  it("registers built-ins as root-compatible visual variants", () => {
    expect(BUILTIN_SUB_THEMES.map(({ id, compatibleRootThemeIds, modes, targets }) => ({
      id,
      compatibleRootThemeIds,
      modes,
      targets,
    }))).toEqual([
      variant("default.neutral"),
      variant("default.warm"),
      variant("default.graphite"),
      variant("default.github"),
      variant("default.newspaper"),
      variant("windows-xp.luna-blue", ["windows-xp"], ["light"], ["markdown", "csv"]),
    ]);
  });

  it("keeps built-in Sub Theme CSS at the public host-token boundary", () => {
    for (const relativePath of ["src/styles/github.css", "src/styles/newspaper.css"]) {
      const css = readFileSync(`${process.cwd()}/${relativePath}`, "utf8");
      expect(css).toContain("[data-po-appearance-root][data-sub-theme-id=");
      expect(css).toMatch(/--po-host-(?:md|csv)-/);
      expect(css).not.toMatch(/\.cm-|\.markdown-codemirror-editor|\.csv-table-editor/);
    }
  });

  it("injects selected CSS inside the sub-theme cascade layer", () => {
    const selected = externalSubTheme({
      compiledCss: {
        application: '[data-po-appearance-root][data-sub-theme-id="com.example.reader"] { --po-text: #222; }',
        markdown: '[data-po-appearance-root][data-sub-theme-id="com.example.reader"] { --po-host-md-content-color: #222; }',
      },
    });

    act(() => root.render(
      <SubThemeStyleHost
        subTheme={selected}
        markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS}
      />,
    ));

    const styles = [...document.head.querySelectorAll<HTMLStyleElement>(
      "style[data-po-sub-theme-style]",
    )];
    expect(styles).toHaveLength(2);
    expect(styles.map((style) => style.dataset.poSubThemeTarget)).toEqual([
      "application",
      "markdown",
    ]);
    expect(styles.every((style) => style.dataset.poThemeLayer === "sub-theme")).toBe(true);
    expect(styles[0]?.textContent).toContain("@layer sub-theme");
    expect(styles[0]?.textContent).toContain("--po-text: #222");
  });

  it("removes stale CSS when the resolved Sub Theme changes", () => {
    const first = externalSubTheme({ id: "com.example.first" });
    const second = externalSubTheme({ id: "com.example.second" });
    act(() => root.render(
      <SubThemeStyleHost subTheme={first} markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS} />,
    ));
    act(() => root.render(
      <SubThemeStyleHost subTheme={second} markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS} />,
    ));

    expect(document.head.querySelector('[data-po-sub-theme-id="com.example.first"]')).toBeNull();
    expect(document.head.querySelector('[data-po-sub-theme-id="com.example.second"]')).not.toBeNull();
  });

  it("keeps retired managed Custom CSS out of the catalog", () => {
    const snapshot = createSubThemeCatalogSnapshot({
      themes: [externalSubTheme({ id: "local.puppyone.custom-css" })],
      diagnostics: [],
    });

    expect(snapshot.subThemes.some(({ id }) => id === "local.puppyone.custom-css")).toBe(false);
  });

  it("preserves declared future Root Theme compatibility without relabeling it as Default", () => {
    const installed = externalSubTheme({
      compatibleRootThemeIds: ["future-shell"],
    });
    const snapshot = createSubThemeCatalogSnapshot({ themes: [installed], diagnostics: [] });

    expect(snapshot.subThemes.find(({ id }) => id === installed.id)?.compatibleRootThemeIds)
      .toEqual(["future-shell"]);
  });

  it("puts typed surface preferences after Sub Theme CSS", () => {
    const selected = externalSubTheme();
    act(() => root.render(
      <SubThemeStyleHost
        subTheme={selected}
        markdownPresentation={{
          ...DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
          headingScale: "large",
        }}
      />,
    ));

    const styles = [...document.head.querySelectorAll<HTMLStyleElement>(
      "style[data-po-sub-theme-style]",
    )];
    expect(styles.map((style) => style.dataset.poThemeLayer)).toEqual([
      "sub-theme",
      "appearance-overrides",
    ]);
    expect(styles[1]?.textContent).toContain("@layer appearance-overrides");
    expect(styles[1]?.textContent).toContain("--po-user-md-h1-size: 2.25em");
    expect(styles[1]?.textContent).toContain("[data-po-appearance-root][data-sub-theme-id]");
  });
});

function externalSubTheme(overrides: Partial<SubThemeDefinition> = {}): SubThemeDefinition {
  const id = overrides.id ?? "com.example.reader";
  return {
    id,
    family: "com.example",
    name: "Reader",
    version: "1.0.0",
    contractVersion: 1,
    compatibleRootThemeIds: ["default"],
    modes: ["light", "dark"],
    targets: ["application", "markdown", "csv"],
    source: "local-package",
    compiledCss: {
      markdown: `[data-po-appearance-root][data-sub-theme-id="${id}"] { --po-host-md-content-color: #222; }`,
    },
    ...overrides,
  };
}

function variant(
  id: string,
  compatibleRootThemeIds: readonly ("default" | "windows-xp")[] = ["default"],
  modes: readonly ("light" | "dark")[] = ["light", "dark"],
  targets: readonly ("application" | "markdown" | "csv")[] = ["application", "markdown", "csv"],
) {
  return { id, compatibleRootThemeIds, modes, targets };
}

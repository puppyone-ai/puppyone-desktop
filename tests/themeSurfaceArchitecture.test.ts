import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("appearance surface boundary", () => {
  it("keeps Root/Sub Theme identity in the product shell and out of shared editors", () => {
    const app = source("src/App.tsx");
    const markdown = source("packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor.tsx");
    const csv = source("packages/shared-ui/src/editor/viewers/csv/CsvTableEditor.tsx");
    const onboarding = source("src/components/MinimalOnboarding.tsx");
    const assetHome = source("src/components/AssetLibraryHome.tsx");
    const restoring = source("src/features/app-shell/RestoringWorkspaceScreen.tsx");
    const context = source("packages/shared-ui/src/core/appearance/EditorAppearanceContext.tsx");

    expect(app).toContain("<EditorAppearanceProvider revision={resolvedAppearance.appearanceRevision}>");
    expect(app).toContain('data-po-appearance-root="true"');
    expect(app).toContain("data-root-theme-id={interfaceStyle}");
    expect(app).toContain("data-sub-theme-id={resolvedAppearance.subThemeId}");
    for (const appearanceRoot of [onboarding, assetHome, restoring]) {
      expect(appearanceRoot).toContain('data-po-appearance-root="true"');
      expect(appearanceRoot).toContain("data-sub-theme-id={subThemeId}");
    }

    expect(context).toContain("EditorAppearanceProvider");
    expect(context).toContain("useEditorAppearanceRevision");
    expect(context).not.toMatch(/ThemeCatalog|SubThemeDefinition|rootThemeId|subThemeId/);
    for (const editor of [markdown, csv]) {
      expect(editor).not.toContain("data-po-appearance-root");
      expect(editor).not.toContain("data-root-theme-id");
      expect(editor).not.toContain("data-sub-theme-id");
      expect(editor).not.toContain("useThemeSurfaceId");
    }
    expect(markdown).toContain("useEditorAppearanceRevision");
    expect(csv).toContain("useEditorAppearanceRevision");
  });

  it("projects product styles through public host tokens consumed by editor-owned CSS", () => {
    const markdownCss = source("packages/shared-ui/src/styles/editor/markdown-content.css");
    const csvCss = source("packages/shared-ui/src/styles/editor/csv-table-editor.css");
    const compiler = source("electron/main/themes/theme-css-compiler.mjs");

    expect(markdownCss).toContain("--po-host-md-content-color");
    expect(markdownCss).toContain("--po-user-md-h1-size");
    expect(csvCss).toContain("--po-host-csv-surface-background");
    expect(compiler).toContain('["--po-md-content-color", "--po-host-md-content-color"]');
    expect(compiler).toContain('["--po-csv-surface-background", "--po-host-csv-surface-background"]');
    expect(compiler).toContain("may only declare root-level public tokens");
  });

  it("loads built-in Sub Theme CSS through the runtime host without private editor selectors", () => {
    const styles = source("src/styles.css");
    const registry = source("src/features/themes/builtinSubThemes.ts");
    const themeFiles = ["github", "newspaper"].map((name) => `src/styles/${name}.css`);

    expect(themeFiles.map((path) => existsSync(new URL(`../${path}`, import.meta.url))))
      .toEqual([true, true]);
    expect(existsSync(new URL("../src/styles/default.css", import.meta.url))).toBe(false);
    for (const name of ["github", "newspaper"]) {
      expect(styles).not.toContain(`./styles/${name}.css`);
    }
    expect(registry).toContain("../../styles/github.css?raw");
    expect(registry).toContain("../../styles/newspaper.css?raw");

    for (const [name, id] of [["github", "default.github"], ["newspaper", "default.newspaper"]]) {
      const css = source(`src/styles/${name}.css`);
      expect(css).toContain(`data-sub-theme-id="${id}"`);
      expect(css).toContain("data-po-appearance-root");
      expect(css).not.toMatch(/\.cm-|\.markdown-codemirror-editor|\.csv-table-editor/);
      expect(css).not.toContain("@puppyone");
    }
  });

  it("keeps built-in font assets relative to the packaged renderer document", () => {
    for (const css of [source("src/styles/github.css"), source("src/styles/newspaper.css")]) {
      expect(css).not.toContain('url("/fonts/');
      expect(css).toContain('url("./fonts/');
    }
  });
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("scoped content theme surfaces", () => {
  it("marks application, Markdown, and CSV roots with stable target and theme IDs", () => {
    const app = source("src/App.tsx");
    const markdown = source("packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor.tsx");
    const csv = source("packages/shared-ui/src/editor/viewers/csv/CsvTableEditor.tsx");
    const onboarding = source("src/components/MinimalOnboarding.tsx");
    const assetHome = source("src/components/AssetLibraryHome.tsx");
    const restoring = source("src/features/app-shell/RestoringWorkspaceScreen.tsx");
    const context = source("packages/shared-ui/src/core/theme/ThemeSurfaceContext.tsx");

    expect(context).toContain("ThemeSurfaceProvider");
    expect(context).toContain("useThemeSurfaceId");
    expect(app).toContain("<ThemeSurfaceProvider");
    expect(app).toContain("desktop-theme-bootstrap-surface");
    expect(app).toContain('className={`desktop-theme-bootstrap-surface ${resolvedTheme === "dark" ? "dark" : ""}`}');
    expect(app).toContain("themeRuntime(");
    expect(app).toContain('data-po-theme-surface="application"');
    expect(app).toContain("<ThemeSurfaceProvider value={themeCatalog.selection}>");
    expect(app).toContain("data-po-theme-id={themeCatalog.selection.application}");
    expect(app).toContain("applicationThemeId={themeCatalog.selection.application}");
    for (const themedRoot of [onboarding, assetHome, restoring]) {
      expect(themedRoot).toContain('data-po-theme-surface="application"');
      expect(themedRoot).toContain("data-po-theme-id={applicationThemeId}");
    }
    expect(markdown).toContain('data-po-theme-surface="markdown"');
    expect(markdown).toContain("data-po-theme-id={themeId}");
    expect(csv).toContain('data-po-theme-surface="csv"');
    expect(csv).toContain("data-po-theme-id={themeId}");
  });

  it("publishes semantic tokens and scoped built-in themes", () => {
    const markdownCss = source("packages/shared-ui/src/styles/editor/markdown-content.css");
    const csvCss = source("packages/shared-ui/src/styles/editor/csv-table-editor.css");
    const styles = source("src/styles.css");
    const editorStyles = source("packages/shared-ui/src/styles/editor.css");

    expect(markdownCss).toContain("--po-md-surface-background");
    expect(markdownCss).toContain("background: var(--po-md-surface-background)");
    expect(csvCss).toContain("--po-csv-surface-background");
    expect(csvCss).toContain("background: var(--po-csv-surface-background)");
    expect(styles).not.toContain("surface-themes.css");
    expect(editorStyles).not.toContain("content-themes.css");
  });

  it("loads the three product-owned Theme Pack CSS files through the runtime theme host", () => {
    const styles = source("src/styles.css");
    const registry = source("src/features/themes/builtinSurfaceThemes.ts");
    const themeFiles = ["default", "github", "newspaper"]
      .map((name) => `src/styles/${name}.css`);

    expect(themeFiles.map((path) => existsSync(new URL(`../${path}`, import.meta.url))))
      .toEqual([true, true, true]);

    for (const name of ["default", "github", "newspaper"]) {
      expect(styles).not.toContain(`./styles/${name}.css`);
    }
    expect(registry).toContain("../../styles/github.css?raw");
    expect(registry).toContain("../../styles/newspaper.css?raw");

    const expectedIds = {
      default: "default",
      github: "builtin.pack.github",
      newspaper: "builtin.pack.newspaper",
    } as const;
    for (const [name, id] of Object.entries(expectedIds)) {
      const css = source(`src/styles/${name}.css`);
      expect(css).toContain(`data-po-theme-id="${id}"`);
      expect(css).not.toContain("@puppyone");
    }
  });

  it("keeps built-in theme font assets relative to the packaged renderer document", () => {
    const githubCss = source("src/styles/github.css");
    const newspaperCss = source("src/styles/newspaper.css");

    for (const css of [githubCss, newspaperCss]) {
      expect(css).not.toContain('url("/fonts/');
      expect(css).toContain('url("./fonts/');
    }
  });
});

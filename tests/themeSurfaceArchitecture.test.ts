import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("scoped content theme surfaces", () => {
  it("marks application, Markdown, and CSV roots with stable target and theme IDs", () => {
    const app = source("src/App.tsx");
    const markdown = source("packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor.tsx");
    const csv = source("packages/shared-ui/src/editor/viewers/csv/CsvTableEditor.tsx");
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
    expect(markdown).toContain('data-po-theme-surface="markdown"');
    expect(markdown).toContain("data-po-theme-id={themeId}");
    expect(csv).toContain('data-po-theme-surface="csv"');
    expect(csv).toContain("data-po-theme-id={themeId}");
  });

  it("publishes semantic tokens and scoped built-in themes", () => {
    const markdownCss = source("packages/shared-ui/src/styles/editor/markdown-content.css");
    const csvCss = source("packages/shared-ui/src/styles/editor/csv-table-editor.css");
    const themesCss = source("packages/shared-ui/src/styles/editor/content-themes.css");
    const styles = source("src/styles.css");
    const editorStyles = source("packages/shared-ui/src/styles/editor.css");

    expect(markdownCss).toContain("--po-md-surface-background");
    expect(markdownCss).toContain("background: var(--po-md-surface-background)");
    expect(csvCss).toContain("--po-csv-surface-background");
    expect(csvCss).toContain("background: var(--po-csv-surface-background)");
    expect(themesCss).toContain('[data-po-theme-id="builtin.markdown.newsprint"]');
    expect(themesCss).toContain('[data-po-theme-id="builtin.markdown.focus"]');
    expect(themesCss).toContain('[data-po-theme-id="builtin.csv.spreadsheet"]');
    expect(themesCss).toContain('[data-po-theme-id="builtin.csv.ledger"]');
    expect(styles).not.toContain("surface-themes.css");
    expect(editorStyles).toContain('@import "./editor/content-themes.css"');
  });
});

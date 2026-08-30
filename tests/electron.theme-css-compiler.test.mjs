import { describe, expect, it, vi } from "vitest";
import { compileThemeCss } from "../electron/main/themes/theme-css-compiler.mjs";

describe("Sub Theme CSS compiler", () => {
  it("maps public Markdown tokens onto the host boundary", async () => {
    const result = await compileThemeCss({
      css: ":root { --po-md-content-color: #332f2a; --po-md-h1-size: 2em; --po-md-h1-weight: 700 }",
      themeId: "com.example.newsprint",
      target: "markdown",
    });

    const host = '[data-po-appearance-root][data-sub-theme-id="com.example.newsprint"]';
    expect(result.css).toContain(`${host} {`);
    expect(result.css).toContain("--po-host-md-content-color: #332f2a");
    expect(result.css).toContain("--po-host-md-h1-size: 2em");
    expect(result.css).toContain("--po-host-md-h1-weight: 700");
    expect(result.css).not.toContain("--po-md-content-color:");
  });

  it("maps public CSV tokens without exposing editor selectors", async () => {
    const result = await compileThemeCss({
      css: ".theme-root { --po-csv-surface-background: #fff; --po-editable-table-border: #ddd }",
      themeId: "com.example.spreadsheet",
      target: "csv",
    });

    expect(result.css).toContain("--po-host-csv-surface-background: #fff");
    expect(result.css).toContain("--po-host-csv-table-border: #ddd");
    expect(result.css).not.toMatch(/\.csv-table-editor|\.editable-table/);
  });

  it("inlines package-local token imports", async () => {
    const loadImport = vi.fn(async (specifier) => {
      expect(specifier).toBe("./shared.css");
      return ":root { --po-md-link-color: #8b2f24 }";
    });
    const result = await compileThemeCss({
      css: '@charset "UTF-8"; @import "./shared.css";',
      themeId: "com.example.newsprint",
      target: "markdown",
      loadImport,
    });

    expect(loadImport).toHaveBeenCalledOnce();
    expect(result.css).toContain("--po-host-md-link-color: #8b2f24");
    expect(result.css).not.toContain("@charset");
    expect(result.css).not.toContain("@import");
  });

  it("limits application variants to the public color-token allowlist", async () => {
    const result = await compileThemeCss({
      css: ".theme-root { --po-surface-canvas: #101114; --po-text: #f7f7f8 }",
      themeId: "com.example.graphite",
      target: "application",
    });
    expect(result.css).toContain("--po-surface-canvas: #101114");

    await expect(compileThemeCss({
      css: ".theme-root { --po-font-ui: Papyrus }",
      themeId: "com.example.graphite",
      target: "application",
    })).rejects.toThrow("Application Sub Themes may only declare public color tokens");
  });

  it("supports root-level dark variants while retaining the same host boundary", async () => {
    const result = await compileThemeCss({
      css: ".theme-root.dark, .dark .theme-root { --po-surface-canvas: #111827 }",
      themeId: "com.example.forest",
      target: "application",
    });

    const host = '[data-po-appearance-root][data-sub-theme-id="com.example.forest"]:where(.dark)';
    expect(result.css).toBe(`${host}, ${host} { --po-surface-canvas: #111827 }`);
  });

  it("enforces declared Color Mode capabilities instead of allowing hidden mode branches", async () => {
    await expect(compileThemeCss({
      css: ".dark .theme-root { --po-surface-canvas: #111827 }",
      themeId: "com.example.light-only",
      target: "application",
      supportedModes: ["light"],
    })).rejects.toThrow("light-only Sub Theme cannot declare dark selectors");

    await expect(compileThemeCss({
      css: "@media (prefers-color-scheme: dark) { :root { --po-surface-canvas: #111827 } }",
      themeId: "com.example.system-query",
      target: "application",
      supportedModes: ["light", "dark"],
    })).rejects.toThrow("declared light/dark variants");
  });

  it.each([
    ":root h1 { --po-md-content-color: red }",
    ".cm-editor { --po-md-content-color: red }",
    ".markdown-codemirror-editor { --po-md-content-color: red }",
    ".theme-root + .outside { --po-md-content-color: red }",
    ".theme-root { color: red }",
    ".theme-root { --po-md-unknown-token: red }",
  ])("rejects CSS that crosses the semantic token contract: %s", async (css) => {
    await expect(compileThemeCss({
      css,
      themeId: "com.example.escape",
      target: "markdown",
    })).rejects.toThrow();
  });

  it.each([
    '@import url("https://example.com/theme.css");',
    '@font-face { font-family: Reader; src: url("./reader.woff2") }',
    ':global(body) { --po-md-content-color: red }',
    ':root { --po-md-h1-size: 4em !important }',
  ])("rejects unsupported or forceful CSS: %s", async (css) => {
    await expect(compileThemeCss({
      css,
      themeId: "com.example.newsprint",
      target: "markdown",
    })).rejects.toThrow();
  });
});

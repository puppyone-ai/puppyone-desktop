import { describe, expect, it, vi } from "vitest";
import { compileThemeCss } from "../electron/main/themes/theme-css-compiler.mjs";

describe("CSS theme compiler", () => {
  it("scopes Typora-style document selectors to one Markdown theme host", async () => {
    const result = await compileThemeCss({
      css: `
        :root { --text-color: #222; }
        html, body, #write { color: var(--text-color); }
        h1, #write h2 { font-family: Georgia, serif; }
      `,
      themeId: "com.example.newsprint",
      target: "markdown",
    });

    const host = '[data-po-theme-surface="markdown"][data-po-theme-id="com.example.newsprint"]';
    expect(result.css).toContain(`${host} { --text-color: #222; }`);
    expect(result.css).toContain(`${host}, ${host}, ${host} { color: var(--text-color); }`);
    expect(result.css).toContain(`${host} h1, ${host} h2 { font-family: Georgia, serif; }`);
  });

  it("accepts the explicit theme-root authoring alias", async () => {
    const result = await compileThemeCss({
      css: ".theme-root { --po-md-content-color: #332f2a } .theme-root blockquote { font-style: italic }",
      themeId: "com.example.newsprint",
      target: "markdown",
    });

    expect(result.css).not.toContain(".theme-root");
    expect(result.css).toContain('[data-po-theme-surface="markdown"]');
    expect(result.css).toContain("blockquote");
  });

  it("inlines local imports and rewrites local asset URLs through host callbacks", async () => {
    const loadImport = vi.fn(async (specifier) => {
      expect(specifier).toBe("./shared.css");
      return ".theme-root strong { color: #8b2f24 }";
    });
    const resolveAssetUrl = vi.fn(async (specifier) => {
      expect(specifier).toBe("./fonts/reader.woff2");
      return "data:font/woff2;base64,Zm9udA==";
    });

    const result = await compileThemeCss({
      css: `
        @import "./shared.css";
        @font-face { font-family: Reader; src: url("./fonts/reader.woff2") format("woff2"); }
        body { font-family: Reader, serif; }
      `,
      themeId: "com.example.newsprint",
      target: "markdown",
      loadImport,
      resolveAssetUrl,
    });

    expect(loadImport).toHaveBeenCalledOnce();
    expect(resolveAssetUrl).toHaveBeenCalledOnce();
    expect(result.css).toContain("strong");
    expect(result.css).toContain("data:font/woff2;base64,Zm9udA==");
    expect(result.css).not.toContain("@import");
  });

  it("accepts local url() imports and strips harmless charset declarations", async () => {
    const loadImport = vi.fn(async () => "body { color: #222 }");
    const result = await compileThemeCss({
      css: '@charset "UTF-8"; @import url(./shared.css);',
      themeId: "com.example.newsprint",
      target: "markdown",
      loadImport,
    });

    expect(loadImport).toHaveBeenCalledWith("./shared.css", "theme.css");
    expect(result.css).not.toContain("@charset");
    expect(result.css).not.toContain("@import");
    expect(result.css).toContain('[data-po-theme-id="com.example.newsprint"]');
  });

  it.each([
    '@import url("https://example.com/theme.css");',
    '.theme-root { background: url("https://example.com/pixel.png") }',
    '.theme-root { background: url("file:///tmp/private.png") }',
    '.theme-root { position: fixed; inset: 0 }',
    'html .theme-root { color: red }',
    ':global(body) { color: red }',
  ])("rejects CSS that can escape or load remote content: %s", async (css) => {
    await expect(compileThemeCss({
      css,
      themeId: "com.example.newsprint",
      target: "markdown",
    })).rejects.toThrow();
  });

  it("limits application themes to root-level PuppyOne tokens", async () => {
    const result = await compileThemeCss({
      css: ".theme-root { --po-surface-canvas: #101114; --po-text: #f7f7f8 }",
      themeId: "com.example.graphite",
      target: "application",
    });
    expect(result.css).toContain("--po-surface-canvas: #101114");

    await expect(compileThemeCss({
      css: ".theme-root button { display: none }",
      themeId: "com.example.graphite",
      target: "application",
    })).rejects.toThrow("Application themes may only declare root-level --po-* tokens");

    await expect(compileThemeCss({
      css: ".theme-root { background: red }",
      themeId: "com.example.graphite",
      target: "application",
    })).rejects.toThrow("Application themes may only declare root-level --po-* tokens");

    await expect(compileThemeCss({
      css: ".theme-root { --po-font-ui: Papyrus; --po-clickable-cursor: crosshair }",
      themeId: "com.example.graphite",
      target: "application",
    })).rejects.toThrow("Application themes may only declare public color tokens");
  });

  it("scopes the documented dark theme-root forms without escaping the surface", async () => {
    const application = await compileThemeCss({
      css: ".theme-root.dark, .dark .theme-root { --po-surface-canvas: #111827 }",
      themeId: "builtin.pack.forest",
      target: "application",
    });
    const markdown = await compileThemeCss({
      css: ".dark .theme-root { --po-md-content-color: #f8fafc }",
      themeId: "builtin.pack.forest",
      target: "markdown",
    });

    const appHost = '[data-po-theme-surface="application"][data-po-theme-id="builtin.pack.forest"]';
    const markdownHost = '[data-po-theme-surface="markdown"][data-po-theme-id="builtin.pack.forest"]';
    expect(application.css).toBe(`${appHost}.dark, ${appHost}.dark { --po-surface-canvas: #111827 }`);
    expect(markdown.css).toContain(`.dark ${markdownHost}`);
  });

  it.each([
    ".theme-root + .outside { color: red }",
    ".theme-root:hover ~ * { display: none }",
    ".dark .theme-root || td { color: red }",
    "+ .outside { color: red }",
  ])("rejects a selector that can leave its theme surface: %s", async (css) => {
    await expect(compileThemeCss({
      css,
      themeId: "com.example.escape",
      target: "markdown",
    })).rejects.toThrow("Theme CSS selector can escape its surface");
  });

  it("allows sibling combinators after the selector has entered the surface subtree", async () => {
    const compiled = await compileThemeCss({
      css: ".theme-root > .row + .row, .theme-root .item ~ .item { color: red }",
      themeId: "com.example.safe",
      target: "markdown",
    });

    const host = '[data-po-theme-surface="markdown"][data-po-theme-id="com.example.safe"]';
    expect(compiled.css).toContain(`${host} > .row + .row, ${host} .item ~ .item`);
  });
});

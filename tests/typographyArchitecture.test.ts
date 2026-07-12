import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_FONT_CATALOG,
  BUILTIN_FONT_IDS,
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  createTypographyRootProps,
  getFontCatalogEntries,
  isValidFontCatalogEntry,
  parseTypographyPreferences,
  resolveTypography,
  withTypographyFont,
  type FontCatalogEntry,
} from "../src/features/typography";

describe("typography architecture", () => {
  it("keeps preferences source-agnostic and resolves unavailable fonts safely", () => {
    const importedId = "imported:9f2b2dc0-regular";
    const preferences = parseTypographyPreferences(JSON.stringify({
      version: 1,
      uiFontId: BUILTIN_FONT_IDS.geistSans,
      contentFontId: importedId,
      codeFontId: BUILTIN_FONT_IDS.geistMono,
    }));

    expect(preferences.contentFontId).toBe(importedId);
    expect(resolveTypography(preferences).content.id).toBe(BUILTIN_FONT_IDS.geistSans);

    const importedEntry: FontCatalogEntry = {
      id: importedId,
      label: "Imported reading font",
      description: "Test font",
      family: '"PuppyOne Imported 9f2b2dc0", serif',
      source: "imported",
      roles: ["content"],
    };
    const resolved = resolveTypography(preferences, [...BUILTIN_FONT_CATALOG, importedEntry]);
    expect(resolved.content).toBe(importedEntry);
    expect(createTypographyRootProps(resolved)).toMatchObject({
      "data-font-content": importedId,
      style: {
        "--po-font-content": importedEntry.family,
      },
    });
  });

  it("changes one semantic role without coupling the other typography roles", () => {
    const defaults = resolveTypography(DEFAULT_TYPOGRAPHY_PREFERENCES);
    expect(defaults.ui.family).toContain('"Geist Sans"');
    expect(defaults.content.family).toBe(defaults.ui.family);
    expect(defaults.code.family).toContain('"Geist Mono"');
    expect(defaults.terminal.family).toBe(
      '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    );

    const next = withTypographyFont(
      DEFAULT_TYPOGRAPHY_PREFERENCES,
      "content",
      BUILTIN_FONT_IDS.systemSerif,
    );

    expect(next).toEqual({
      ...DEFAULT_TYPOGRAPHY_PREFERENCES,
      contentFontId: BUILTIN_FONT_IDS.systemSerif,
    });
    expect(getFontCatalogEntries("content").map((font) => font.id)).toEqual([
      BUILTIN_FONT_IDS.geistSans,
      BUILTIN_FONT_IDS.systemSans,
      BUILTIN_FONT_IDS.systemSerif,
    ]);
    expect(getFontCatalogEntries("code").map((font) => font.id)).toEqual([
      BUILTIN_FONT_IDS.geistMono,
    ]);
    expect(getFontCatalogEntries("terminal").map((font) => font.id)).toEqual([
      BUILTIN_FONT_IDS.terminalSystemMono,
    ]);
  });

  it("rejects CSS-like IDs before they can reach the font resolver", () => {
    const parsed = parseTypographyPreferences(JSON.stringify({
      version: 1,
      uiFontId: "url(https://example.invalid/font.woff2)",
      contentFontId: "font-family: serif",
      codeFontId: "../../font.ttf",
    }));
    expect(parsed).toEqual(DEFAULT_TYPOGRAPHY_PREFERENCES);
    expect(isValidFontCatalogEntry({
      id: "imported:unsafe",
      label: "Unsafe",
      description: "Unsafe test entry",
      family: "url(https://example.invalid/font.woff2)",
      source: "imported",
      roles: ["content"],
    })).toBe(false);
  });

  it("binds content surfaces and metric-sensitive consumers to semantic contracts", () => {
    const tokens = source("src/styles/tokens.css");
    const markdown = source("packages/shared-ui/src/styles/editor/markdown-editor.css");
    const plainText = source("packages/shared-ui/src/styles/editor/editor-chrome.css");
    const agentTranscript = source("src/features/desktop-agent/ui/styles/transcript.css");
    const terminal = source("src/features/desktop-terminal/ui/RightTerminalPanel.tsx");
    const markdownEditor = source("packages/shared-ui/src/editor/markdown/MarkdownCodeMirrorEditor.tsx");
    const codeEditor = source("packages/shared-ui/src/editor/CodeMirrorCodeEditor.tsx");

    expect(tokens).toContain("--po-font-ui: var(--font-geist-sans);");
    expect(tokens).toContain("--po-font-content: var(--font-geist-sans);");
    expect(tokens).toContain("--po-font-code: var(--font-geist-mono);");
    expect(tokens).toContain("--po-font-terminal: var(--font-terminal-mono);");
    expect(tokens).toContain("--po-font-sans: var(--po-font-ui);");
    expect(tokens).toContain("--po-font-mono: var(--po-font-code);");
    expect(markdown).toContain("font-family: var(--po-font-content, var(--po-font-sans));");
    expect(plainText).toContain("font-family: var(--po-font-content, var(--po-font-sans));");
    expect(agentTranscript).toContain("font-family: var(--po-font-content, var(--po-font-sans));");
    expect(terminal).toContain('getPropertyValue("--po-font-terminal")');
    expect(terminal).toContain("subscribeTypographyChanges(document, applyTheme)");
    expect(markdownEditor).toContain("subscribeTypographyChanges(host.ownerDocument");
    expect(codeEditor).toContain("subscribeTypographyChanges(host.ownerDocument");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

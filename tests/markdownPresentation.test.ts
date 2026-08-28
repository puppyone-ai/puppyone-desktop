import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
  parseMarkdownPresentationSettings,
  resolveMarkdownPresentationStyle,
  serializeMarkdownPresentationSettings,
} from "../src/features/markdown/markdownPresentation";

describe("Markdown presentation preferences", () => {
  it("uses stable defaults for missing or malformed values", () => {
    expect(parseMarkdownPresentationSettings(null)).toEqual(DEFAULT_MARKDOWN_PRESENTATION_SETTINGS);
    expect(parseMarkdownPresentationSettings("{")).toEqual(DEFAULT_MARKDOWN_PRESENTATION_SETTINGS);
    expect(parseMarkdownPresentationSettings(JSON.stringify({ h1Scale: "unsupported" })))
      .toEqual(DEFAULT_MARKDOWN_PRESENTATION_SETTINGS);
  });

  it("migrates the legacy emphasis color value", () => {
    expect(parseMarkdownPresentationSettings("warm")).toEqual({
      ...DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
      strongColor: "warm",
    });
  });

  it("round-trips valid preferences and resolves their CSS tokens", () => {
    const settings = {
      h1Scale: "large",
      h2Scale: "compact",
      h3Scale: "large",
      strongColor: "accent",
      strongWeight: "heavy",
    } as const;

    expect(parseMarkdownPresentationSettings(serializeMarkdownPresentationSettings(settings)))
      .toEqual(settings);
    expect(resolveMarkdownPresentationStyle(settings)).toEqual({
      "--po-md-h1-size": "2.25em",
      "--po-md-h2-size": "1.375em",
      "--po-md-h3-size": "1.375em",
      "--po-md-strong-weight": "700",
      "--po-md-strong-color": "var(--po-accent)",
    });
  });
});

import { describe, expect, it } from "vitest";
import { assertMarkdownWebEmbedHref } from "../electron/main/markdown-web-embed-policy.mjs";

describe("Markdown web embed href policy", () => {
  it("allows only https embeds", () => {
    expect(assertMarkdownWebEmbedHref("https://example.com/x")).toBe("https://example.com/x");
    expect(() => assertMarkdownWebEmbedHref("file:///tmp/x.html")).toThrow(/https/i);
    expect(() => assertMarkdownWebEmbedHref("http://example.com")).toThrow(/https/i);
  });
});

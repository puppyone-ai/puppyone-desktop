import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  getInlineRevealElement,
  getMarkdownElements,
} from "../vendor/shared-ui/src/editor/markdown/syntax/markdownElements";
import { puppyMarkdownParserExtensions } from "../vendor/shared-ui/src/editor/markdown/syntax/markdownParserExtensions";

function createMarkdownState(source: string) {
  return EditorState.create({
    doc: source,
    extensions: [
      markdown({ base: markdownLanguage, extensions: puppyMarkdownParserExtensions }),
    ],
  });
}

describe("markdown live preview element model", () => {
  it("normalizes heading marker ranges", () => {
    const state = createMarkdownState("# Heading");
    const heading = getMarkdownElements(state).find((element) => element.kind === "heading");

    expect(heading).toMatchObject({
      kind: "heading",
      from: 0,
      to: 9,
      markerRanges: [{ from: 0, to: 2 }],
      contentRange: { from: 2, to: 9 },
      level: 1,
    });
  });

  it("normalizes task marker stages", () => {
    const state = createMarkdownState("- [x] Done");
    const task = getMarkdownElements(state).find((element) => element.kind === "task");

    expect(task?.markerRanges).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 6 },
    ]);
    expect(task?.contentRange).toEqual({ from: 6, to: 10 });
  });

  it("normalizes wiki links and standard links", () => {
    const state = createMarkdownState("[label](note.md) and [[Target|Alias]]");
    const links = getMarkdownElements(state).filter((element) => element.kind === "link" || element.kind === "wikiLink");

    expect(links.map((element) => ({
      kind: element.kind,
      from: element.from,
      to: element.to,
      contentRange: element.contentRange,
    }))).toEqual([
      { kind: "link", from: 0, to: 16, contentRange: { from: 1, to: 6 } },
      { kind: "wikiLink", from: 21, to: 37, contentRange: { from: 30, to: 35 } },
    ]);
  });

  it("reveals inline elements only when the caret is strictly inside", () => {
    const state = createMarkdownState("A **bold** word");
    expect(getInlineRevealElement(state, 2)).toBeNull();
    expect(getInlineRevealElement(state, 3)?.kind).toBe("strong");
    expect(getInlineRevealElement(state, 8)?.kind).toBe("strong");
    expect(getInlineRevealElement(state, 10)).toBeNull();
  });

  it("keeps images atomic rather than inline-revealed", () => {
    const state = createMarkdownState("![alt](image.png)");
    const image = getMarkdownElements(state).find((element) => element.kind === "image");

    expect(image).toMatchObject({
      kind: "image",
      from: 0,
      to: 17,
    });
    expect(getInlineRevealElement(state, 4)).toBeNull();
  });
});

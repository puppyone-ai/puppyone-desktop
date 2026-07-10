import type { InlineContext, MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";
import { parseMarkdownImageTokenAt } from "../../features/image/markdownImageModel";

export const puppyMarkdownParserExtensions: MarkdownConfig[] = [
  {
    defineNodes: [
      { name: "ObsidianImageEmbed", style: { "ObsidianImageEmbed/...": tags.link } },
      { name: "ObsidianImageMark", style: tags.processingInstruction },
      { name: "ObsidianImageTarget", style: tags.url },
      { name: "ObsidianImageAlias", style: tags.labelName },
    ],
    parseInline: [
      {
        name: "ObsidianImageEmbed",
        before: "Image",
        parse(cx, next, pos) {
          if (next !== 33 /* ! */) return -1;
          return parseObsidianImageEmbed(cx, pos);
        },
      },
    ],
  },
];

function parseObsidianImageEmbed(cx: InlineContext, pos: number): number {
  const from = pos - cx.offset;
  const token = parseMarkdownImageTokenAt(cx.text, from);
  if (!token || !cx.text.startsWith("![[", token.from)) return -1;

  const absoluteFrom = token.from + cx.offset;
  const absoluteTo = token.to + cx.offset;
  const contentFrom = absoluteFrom + 3;
  const contentTo = absoluteTo - 2;
  const pipeOffset = findUnescapedPipe(cx.text, token.from + 3, token.to - 2);
  const children = [
    cx.elt("ObsidianImageMark", absoluteFrom, contentFrom),
    cx.elt(
      "ObsidianImageTarget",
      contentFrom,
      pipeOffset === -1 ? contentTo : pipeOffset + cx.offset,
    ),
  ];

  if (pipeOffset !== -1) {
    children.push(
      cx.elt("ObsidianImageMark", pipeOffset + cx.offset, pipeOffset + cx.offset + 1),
      cx.elt("ObsidianImageAlias", pipeOffset + cx.offset + 1, contentTo),
    );
  }

  children.push(cx.elt("ObsidianImageMark", contentTo, absoluteTo));
  return cx.addElement(cx.elt("ObsidianImageEmbed", absoluteFrom, absoluteTo, children));
}

function findUnescapedPipe(source: string, from: number, to: number): number {
  for (let index = from; index < to; index += 1) {
    if (source[index] === "|" && !isEscaped(source, index)) return index;
  }
  return -1;
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

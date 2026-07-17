import { defineMarkdownFeature } from "../../core/features/markdownFeatureContract";
import { getObsidianMediaEmbedNodesInRange } from "../media/markdownMediaSyntaxNode";
import { isObsidianImageEmbedSize } from "../media/obsidianMediaEmbed";
import { resolveMarkdownMediaReference } from "../media/markdownMediaReference";
import { ImagePreviewWidget } from "./imagePreviewWidget";
import { compileImageElementPlan } from "./imagePlan";
import { findStandardMarkdownImageTokens, type MarkdownImageToken } from "./markdownImageModel";

export const imageFeature = defineMarkdownFeature({
  id: "image",
  semanticKinds: ["image"],
  inlineWidgetKinds: ["image"],
  blockWidgetKinds: [],
  collectRange(state, from, to) {
    return getObsidianMediaEmbedNodesInRange(state, from, to, "image").map((token) => (
      createImageElement({
        from: token.from,
        to: token.to,
        alt: token.alias && !isObsidianImageEmbedSize(token.alias)
          ? token.alias
          : token.target,
        href: token.target,
        title: null,
        referenceKind: "wiki-target",
      })
    ));
  },
  collectLine(line) {
    return findStandardMarkdownImageTokens(line.text).map((token) => createImageElement({
      ...token,
      from: line.from + token.from,
      to: line.from + token.to,
    }));
  },
  compile(element) {
    return compileImageElementPlan(element);
  },
  createInlineWidget(plan, context) {
    const resolvedSource = resolveMarkdownMediaReference(
      context.documentPath,
      plan.atom.href,
      plan.atom.referenceKind,
      context.markdownLinkGraph,
    );
    return new ImagePreviewWidget(
      plan.sourceRange.from,
      plan.sourceRange.to,
      plan.atom.alt,
      plan.atom.href,
      plan.atom.title,
      context.documentPath,
      resolvedSource,
    );
  },
});

function createImageElement(token: MarkdownImageToken) {
  return {
    kind: "image" as const,
    from: token.from,
    to: token.to,
    markerRanges: [{ from: token.from, to: token.to }],
    contentRange: { from: token.from, to: token.to },
    blockData: {
      kind: "image" as const,
      alt: token.alt,
      href: token.href,
      title: token.title,
      referenceKind: token.referenceKind,
    },
  };
}

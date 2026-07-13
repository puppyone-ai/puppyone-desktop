import type { MarkdownLinkGraph } from "../../../viewerTypes";
import type { MessageFormatter } from "@puppyone/localization/core";
import { renderMarkdownInlineInto } from "../rendering/inlineRenderer";

/**
 * Broker-only options for the isolated-string preview adapter. This adapter
 * does not consume the document's range-indexed `MarkdownElementPlan`: table
 * cells do not own an EditorState or syntax tree. It shares the canonical HTML,
 * URL, and broker policies while its lightweight Markdown tokenizer remains an
 * explicit compatibility boundary.
 */
export type MarkdownInlinePreviewOptions = {
  markdownLinkGraph?: MarkdownLinkGraph | null;
  sourcePath?: string;
  onLayoutChange?: () => void;
  /** AssetBroker-backed resolver. Required for workspace images to load. */
  resolveAssetUrl?: (
    documentPath: string,
    href: string,
    signal?: AbortSignal,
  ) => string | Promise<string | null> | null;
  /** LinkBroker-backed activation. */
  openHref?: (href: string) => void;
  t?: MessageFormatter;
};

/** @deprecated Prefer the contract-accurate MarkdownInlinePreviewOptions name. */
export type MarkdownInlinePlanOptions = MarkdownInlinePreviewOptions;

/**
 * Public isolated-string preview entry for table cells and similar surfaces.
 * Images require the AssetBroker wrapper and all raw/Markdown anchors remain
 * inert unless a LinkBroker-backed `openHref` is supplied. Unsafe hrefs are
 * rejected by the shared URL authority inside the renderer.
 */
export function renderMarkdownInlineFromSharedPolicy(
  target: Node,
  source: string,
  options: MarkdownInlinePreviewOptions = {},
): void {
  renderMarkdownInlineInto(target, source, {
    markdownLinkGraph: options.markdownLinkGraph ?? null,
    sourcePath: options.sourcePath,
    onLayoutChange: options.onLayoutChange,
    resolveAssetUrl: options.resolveAssetUrl,
    openHref: options.openHref,
    t: options.t,
  });
}

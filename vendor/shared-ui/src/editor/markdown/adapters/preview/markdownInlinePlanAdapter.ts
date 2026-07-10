import type { MarkdownLinkGraph } from "../../../viewerTypes";
import { renderMarkdownInlineInto } from "../../rendering/inlineRenderer";

/**
 * Broker-only inline render options. There is deliberately NO raw
 * `markdownAssetUrlResolver` here: every image/link on this path must go through
 * an `AssetBroker` / `LinkBroker` wrapper supplied by the host. HTML fragments
 * are compiled through the shared inline-HTML policy (`createDomFromInlineHtmlSource`)
 * and sanitized with the central profiles inside `renderMarkdownInlineInto`.
 */
export type MarkdownInlinePlanOptions = {
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
};

/**
 * Public plan→DOM entry for table cells and other preview surfaces. Renders
 * inline Markdown + broad-safe inline HTML from the shared policy, routing
 * images through the AssetBroker wrapper and links through the LinkBroker
 * wrapper. Unsafe hrefs are rejected by `markdownUrlPolicy` inside the renderer.
 */
export function renderMarkdownInlineFromSharedPolicy(
  target: Node,
  source: string,
  options: MarkdownInlinePlanOptions = {},
): void {
  renderMarkdownInlineInto(target, source, {
    markdownLinkGraph: options.markdownLinkGraph ?? null,
    sourcePath: options.sourcePath,
    onLayoutChange: options.onLayoutChange,
    resolveAssetUrl: options.resolveAssetUrl,
    openHref: options.openHref,
  });
}

import { Facet, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { findWikiLinkTokens } from "./links/wikiLinkModel";
import { findMarkdownLinkTokens, isExternalMarkdownHref } from "./links/markdownLinkModel";
import { isSafeHref } from "./rendering/markdownHtmlPolicy";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../viewerTypes";

export const markdownHtmlTrustModeFacet = Facet.define<MarkdownHtmlTrustMode, MarkdownHtmlTrustMode>({
  combine(values) {
    return values.length > 0 ? values[values.length - 1] : "safe";
  },
});

export const markdownLinkGraphFacet = Facet.define<MarkdownLinkGraph | null, MarkdownLinkGraph | null>({
  combine(values) {
    return values.length > 0 ? values[values.length - 1] : null;
  },
});

export const markdownDocumentPathFacet = Facet.define<string, string>({
  combine(values) {
    return values.length > 0 ? values[values.length - 1] : "";
  },
});

export const markdownAssetUrlResolverFacet = Facet.define<MarkdownAssetUrlResolver | null, MarkdownAssetUrlResolver | null>({
  combine(values) {
    return values.length > 0 ? values[values.length - 1] : null;
  },
});

export function markdownLivePreviewContextExtension(
  htmlTrustMode: MarkdownHtmlTrustMode,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
): Extension {
  return [
    markdownHtmlTrustModeFacet.of(htmlTrustMode),
    markdownLinkGraphFacet.of(markdownLinkGraph),
    markdownDocumentPathFacet.of(documentPath),
    markdownAssetUrlResolverFacet.of(markdownAssetUrlResolver),
    markdownLinkOpenHandler,
  ];
}

const markdownLinkOpenHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;
    const opened = openMarkdownLinkFromEvent(event, view);
    if (opened) suppressNextMouseLinkClickUntil = Date.now() + 700;
    return opened;
  },
  click(event, view) {
    if (
      event.detail > 0 &&
      suppressNextMouseLinkClickUntil >= Date.now() &&
      getMarkdownLinkElementFromEvent(event, view)
    ) {
      suppressNextMouseLinkClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return openMarkdownLinkFromEvent(event, view);
  },
  keydown(event, view) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return false;
    const linkElement = getMarkdownLinkElementFromEvent(event, view);
    if (!linkElement) return false;
    return openMarkdownLinkFromEvent(event, view);
  },
});

let suppressNextMouseLinkClickUntil = 0;

function openMarkdownLinkFromEvent(event: Event, view: EditorView): boolean {
  if (event.defaultPrevented) return false;
  if (!isMarkdownLinkOpenGesture(event)) return false;
  const linkElement = getMarkdownLinkElementFromEvent(event, view);
  if (!linkElement) return false;

  const opened = openMarkdownLinkElement(linkElement, view);
  if (!opened) return false;

  event.preventDefault();
  event.stopPropagation();
  return true;
}

function isMarkdownLinkOpenGesture(event: Event): boolean {
  if (event instanceof MouseEvent) return event.metaKey || event.ctrlKey;
  if (event instanceof KeyboardEvent) return event.metaKey || event.ctrlKey;
  return false;
}

function getMarkdownLinkElementFromEvent(event: Event, view: EditorView): HTMLElement | null {
  const targetElement = getEventTargetElement(event.target);
  if (!targetElement) return null;

  const linkElement = targetElement.closest<HTMLElement>(
    ".cm-md-wiki-link-label[data-wiki-target], .cm-md-link-label[data-md-href]",
  );
  if (!linkElement || !view.dom.contains(linkElement)) return null;
  return linkElement;
}

function openMarkdownLinkElement(linkElement: HTMLElement, view: EditorView): boolean {
  const linkGraph = view.state.facet(markdownLinkGraphFacet);
  const sourcePath = view.state.facet(markdownDocumentPathFacet);
  const wikiTarget = linkElement.dataset.wikiTarget;
  if (wikiTarget) {
    if (!linkGraph?.openWikiLink) return false;

    const resolvedTarget = linkGraph.resolveWikiLink(sourcePath, wikiTarget);
    if (!resolvedTarget.exists && (!resolvedTarget.candidatePaths || resolvedTarget.candidatePaths.length === 0)) {
      return false;
    }

    linkGraph.openWikiLink(resolvedTarget, sourcePath);
    return true;
  }

  const href = linkElement.dataset.mdHref;
  if (!href) return false;

  if (isExternalMarkdownHref(href) && isSafeHref(href)) {
    return openExternalMarkdownHref(href, view);
  }

  const resolvedTarget = linkGraph?.resolveMarkdownLink(sourcePath, href) ?? null;
  if (!resolvedTarget || !linkGraph?.openWikiLink) return false;
  if (!resolvedTarget.exists && (!resolvedTarget.candidatePaths || resolvedTarget.candidatePaths.length === 0)) {
    return false;
  }

  linkGraph.openWikiLink(resolvedTarget, sourcePath);
  return true;
}

function openExternalMarkdownHref(href: string, view: EditorView): boolean {
  const linkGraph = view.state.facet(markdownLinkGraphFacet);
  if (linkGraph?.openExternalUrl) {
    linkGraph.openExternalUrl(href);
    return true;
  }

  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

export function findMarkdownLinkTokenAt(source: string, from: number, to: number): { href: string } | null {
  return findMarkdownLinkTokens(source).find((token) => token.from === from && token.to === to) ?? null;
}

export function findWikiLinkTokenAt(source: string, from: number, to: number): { target: string } | null {
  return findWikiLinkTokens(source).find((token) => token.from === from && token.to === to) ?? null;
}

import { Facet, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { findWikiLinkTokens } from "./links/wikiLinkModel";
import { findMarkdownLinkTokens, isExternalMarkdownHref } from "./links/markdownLinkModel";
import { getMarkdownEmbedHost } from "./adapters/codemirror/embedHost";
import { createCapabilityPrincipal, workspaceIdForDocument } from "./services/capabilityPrincipal";
import { getDocRevision } from "./services/transactionBroker";
import { isSafeHref } from "./policy/markdownUrlPolicy";
import { getInlineRevealElement, type MarkdownElement } from "./syntax/markdownElements";
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
    markdownLinkModifierClassHandler,
    markdownLinkOpenHandler,
  ];
}

const MARKDOWN_LINK_OPEN_MODIFIER_CLASS = "cm-md-open-modifier-down";

const markdownLinkModifierClassHandler = EditorView.domEventHandlers({
  keydown(event, view) {
    setMarkdownLinkModifierClass(view, event.metaKey || event.ctrlKey);
    return false;
  },
  keyup(event, view) {
    setMarkdownLinkModifierClass(view, event.metaKey || event.ctrlKey);
    return false;
  },
  mousemove(event, view) {
    setMarkdownLinkModifierClass(view, event.metaKey || event.ctrlKey);
    return false;
  },
  mouseleave(_event, view) {
    setMarkdownLinkModifierClass(view, false);
    return false;
  },
  blur(_event, view) {
    setMarkdownLinkModifierClass(view, false);
    return false;
  },
});

function setMarkdownLinkModifierClass(view: EditorView, active: boolean) {
  view.dom.classList.toggle(MARKDOWN_LINK_OPEN_MODIFIER_CLASS, active);
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
    if (event.key !== "Enter" || !isMarkdownLinkOpenGesture(event, view)) return false;
    if (openMarkdownLinkAtSelection(event, view)) return true;

    const linkElement = getMarkdownLinkElementFromEvent(event, view);
    if (!linkElement) return false;
    return openMarkdownLinkFromEvent(event, view);
  },
});

let suppressNextMouseLinkClickUntil = 0;

function openMarkdownLinkFromEvent(event: Event, view: EditorView): boolean {
  if (event.defaultPrevented) return false;
  if (!isMarkdownLinkOpenGesture(event, view)) return false;
  const linkElement = getMarkdownLinkElementFromEvent(event, view);
  if (!linkElement) return false;

  const opened = openMarkdownLinkElement(linkElement, view);
  if (!opened) return false;

  event.preventDefault();
  event.stopPropagation();
  return true;
}

function isMarkdownLinkOpenGesture(event: Event, view: EditorView): boolean {
  if (view.state.readOnly) return true;
  if (event instanceof MouseEvent) return event.metaKey || event.ctrlKey;
  if (event instanceof KeyboardEvent) return event.metaKey || event.ctrlKey;
  return false;
}

function getMarkdownLinkElementFromEvent(event: Event, view: EditorView): HTMLElement | null {
  const targetElement = getEventTargetElement(event.target);
  if (!targetElement) return null;

  const linkElement = targetElement.closest<HTMLElement>(
    ".cm-md-wiki-link-label[data-wiki-target], .cm-md-link-label[data-md-href], a.cm-md-inline-html[data-md-href], .cm-md-inline-html[data-md-href]",
  );
  if (!linkElement || !view.dom.contains(linkElement)) return null;
  return linkElement;
}

function openMarkdownLinkElement(linkElement: HTMLElement, view: EditorView): boolean {
  const wikiTarget = linkElement.dataset.wikiTarget;
  if (wikiTarget) return openWikiLinkTarget(wikiTarget, view);

  const href = linkElement.dataset.mdHref;
  if (!href) return false;
  return openMarkdownHref(href, view);
}

function openMarkdownLinkAtSelection(event: Event, view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) return false;

  const selection = state.selection.main;
  if (!selection.empty) return false;

  const element = getInlineRevealElement(state, selection.from);
  if (!element || (element.kind !== "wikiLink" && element.kind !== "link")) return false;

  const opened = openMarkdownLinkElementFromSource(element, view);
  if (!opened) return false;

  event.preventDefault();
  event.stopPropagation();
  return true;
}

function openMarkdownLinkElementFromSource(element: MarkdownElement, view: EditorView): boolean {
  const source = view.state.sliceDoc(element.from, element.to);
  if (element.kind === "wikiLink") {
    const token = findWikiLinkTokenAt(source, 0, source.length);
    return token ? openWikiLinkTarget(token.target, view) : false;
  }

  const token = findMarkdownLinkTokenAt(source, 0, source.length);
  if (token) return openMarkdownHref(token.href, view);

  const href = element.contentRange ? view.state.sliceDoc(element.contentRange.from, element.contentRange.to).trim() : "";
  return href ? openMarkdownHref(href, view) : false;
}

function openWikiLinkTarget(wikiTarget: string, view: EditorView): boolean {
  const linkGraph = view.state.facet(markdownLinkGraphFacet);
  const sourcePath = view.state.facet(markdownDocumentPathFacet);
  if (!linkGraph?.openWikiLink) return false;

  const resolvedTarget = linkGraph.resolveWikiLink(sourcePath, wikiTarget);
  if (!resolvedTarget.exists && (!resolvedTarget.candidatePaths || resolvedTarget.candidatePaths.length === 0)) {
    return false;
  }

  linkGraph.openWikiLink(resolvedTarget, sourcePath);
  return true;
}

function openMarkdownHref(href: string, view: EditorView): boolean {
  if (!isSafeHref(href)) return false;

  const host = getMarkdownEmbedHost(view);
  const documentPath = view.state.facet(markdownDocumentPathFacet);
  const result = host.links.resolve(
    createCapabilityPrincipal({
      editorViewId: host.viewId,
      workspaceId: workspaceIdForDocument(documentPath),
      documentPath,
      documentRevision: getDocRevision(view.state.doc),
      purpose: "link-open",
    }),
    href,
  );

  if (result.action === "deny") return false;

  if (result.action === "navigate-internal") {
    const linkGraph = view.state.facet(markdownLinkGraphFacet);
    const resolvedTarget = linkGraph?.resolveMarkdownLink(documentPath, result.path) ?? null;
    if (!resolvedTarget || !linkGraph?.openWikiLink) return false;
    if (!resolvedTarget.exists && (!resolvedTarget.candidatePaths || resolvedTarget.candidatePaths.length === 0)) {
      return false;
    }
    linkGraph.openWikiLink(resolvedTarget, documentPath);
    return true;
  }

  if (result.action === "open-external" || result.action === "confirm-external") {
    return openExternalMarkdownHref(result.href, view);
  }

  return false;
}

function openExternalMarkdownHref(href: string, view: EditorView): boolean {
  const linkGraph = view.state.facet(markdownLinkGraphFacet);
  if (linkGraph?.openExternalUrl) {
    void Promise.resolve().then(() => linkGraph.openExternalUrl?.(href)).catch((error) => {
      console.warn("Unable to open external Markdown link:", error);
    });
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

import { createDomFromInlineHtmlSource } from "../adapters/preview/inlineHtmlDomAdapter";
import { isSafeHref } from "./markdownHtmlPolicy";
import { appendSanitizedInlineHtml } from "./sanitizeHtml";
import type { MarkdownAssetUrlResolver, MarkdownLinkGraph } from "../../viewerTypes";
import {
  findMarkdownImageTokens,
  isSafeMarkdownImageUrl,
  parseMarkdownImageTokenAt,
  resolveMarkdownHtmlImageSources,
} from "../links/markdownImageModel";
import { findWikiLinkTokens, type MarkdownWikiLinkToken } from "../links/wikiLinkModel";

type InlineToken =
  | { kind: "code"; from: number; to: number; text: string }
  | { kind: "del" | "em" | "strong"; from: number; to: number; text: string }
  | { kind: "image"; from: number; to: number; alt: string; href: string; title: string | null }
  | { kind: "link"; from: number; to: number; label: string; href: string }
  | { kind: "wikiLink"; from: number; to: number; token: MarkdownWikiLinkToken };

export type MarkdownInlineRenderOptions = {
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  /**
   * Preferred asset entry point. When set, table/preview image loads go through
   * this callback (typically an AssetBroker wrapper) instead of the raw resolver.
   */
  resolveAssetUrl?: (
    documentPath: string,
    href: string,
    signal?: AbortSignal,
  ) => string | Promise<string | null> | null;
  onLayoutChange?: () => void;
  sourcePath?: string;
  openHref?: (href: string) => void;
};

export function createMarkdownInlineFragment(
  source: string,
  options: MarkdownInlineRenderOptions = {},
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  renderMarkdownInlineInto(fragment, source, options);
  return fragment;
}

export function renderMarkdownInlineInto(
  target: Node,
  source: string,
  options: MarkdownInlineRenderOptions = {},
) {
  if (!source) return;

  if (mightContainHtml(source)) {
    appendInlineHtml(target, source, options);
    return;
  }

  appendMarkdownText(target, source, options);
}

function appendInlineHtml(target: Node, source: string, options: MarkdownInlineRenderOptions) {
  const resolver = options.resolveAssetUrl ?? options.markdownAssetUrlResolver ?? null;
  const shouldResolveImages = Boolean(resolver && /<img\b/i.test(source));
  if (!shouldResolveImages) {
    renderSanitizedInlineHtml(target, source, options);
    return;
  }

  const targetNode = document.createElement("span");
  target.appendChild(targetNode);
  renderSanitizedInlineHtml(targetNode, source, options);

  if (!resolver) return;

  resolveMarkdownHtmlImageSources(source, options.sourcePath ?? "", resolver)
    .then((resolvedSource) => {
      if (resolvedSource === source) return;
      if (targetNode instanceof HTMLElement && !targetNode.isConnected) return;
      targetNode.replaceChildren();
      renderSanitizedInlineHtml(targetNode, resolvedSource, {
        ...options,
        markdownAssetUrlResolver: null,
        resolveAssetUrl: undefined,
      });
      options.onLayoutChange?.();
    })
    .catch(() => undefined);
}

function renderSanitizedInlineHtml(target: Node, source: string, options: MarkdownInlineRenderOptions) {
  // Prefer the same policy compiler as live preview for a single complete
  // inline HTML element (common table-cell case).
  const trimmed = source.trim();
  if (/^<[a-z][\s\S]*>[\s\S]*<\/[a-z][\s\S]*>$/i.test(trimmed) && (trimmed.match(/</g) ?? []).length <= 2) {
    const planned = createDomFromInlineHtmlSource(trimmed);
    if (planned) {
      // Preserve nested Markdown inside the HTML content by re-rendering the
      // inner text through the Markdown inline path.
      const inner = planned.textContent ?? "";
      planned.textContent = "";
      appendMarkdownText(planned, inner, options);
      target.appendChild(planned);
      return;
    }
  }

  const template = document.createElement("template");
  template.innerHTML = source;
  appendSanitizedInlineHtml(target, template.content, (node, text) => appendMarkdownText(node, text, options));
}

function appendMarkdownText(target: Node, source: string, options: MarkdownInlineRenderOptions) {
  let cursor = 0;

  while (cursor < source.length) {
    const token = findNextToken(source, cursor);
    if (!token) {
      appendText(target, source.slice(cursor));
      break;
    }

    if (token.from > cursor) {
      appendText(target, source.slice(cursor, token.from));
    }

    appendToken(target, token, options);
    cursor = token.to;
  }
}

function appendToken(target: Node, token: InlineToken, options: MarkdownInlineRenderOptions) {
  if (token.kind === "code") {
    const code = document.createElement("code");
    code.className = "cm-md-inline-code";
    code.textContent = token.text;
    target.appendChild(code);
    return;
  }

  if (token.kind === "wikiLink") {
    appendWikiLink(target, token.token, options);
    return;
  }

  if (token.kind === "image") {
    appendImage(target, token, options);
    return;
  }

  if (token.kind === "link") {
    if (!isSafeHref(token.href)) {
      appendText(target, token.label);
      return;
    }

    const link = document.createElement("a");
    link.className = "cm-md-inline-link";
    link.setAttribute("data-md-href", token.href);
    link.rel = "noreferrer noopener";
    link.href = "#";
    renderMarkdownInlineInto(link, token.label, options);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (options.openHref) {
        options.openHref(token.href);
        return;
      }
      if (/^https?:\/\//i.test(token.href)) {
        window.open(token.href, "_blank", "noopener,noreferrer");
      }
    });
    target.appendChild(link);
    return;
  }

  const element = document.createElement(token.kind);
  renderMarkdownInlineInto(element, token.text, options);
  target.appendChild(element);
}

function appendWikiLink(target: Node, token: MarkdownWikiLinkToken, options: MarkdownInlineRenderOptions) {
  const linkGraph = options.markdownLinkGraph ?? null;
  const sourcePath = options.sourcePath ?? "";
  const resolvedTarget = linkGraph?.resolveWikiLink(sourcePath, token.target) ?? null;

  if (!resolvedTarget?.exists) {
    const missing = document.createElement("span");
    missing.className = "cm-md-wiki-link-inline is-missing";
    missing.textContent = token.label;
    missing.title = `Missing linked note: ${token.target}`;
    target.appendChild(missing);
    return;
  }

  const link = document.createElement("a");
  link.href = "#";
  link.className = resolvedTarget.ambiguous
    ? "cm-md-wiki-link-inline is-resolved is-ambiguous"
    : "cm-md-wiki-link-inline is-resolved";
  link.textContent = token.label;
  link.title = resolvedTarget.path ?? token.target;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    linkGraph?.openWikiLink?.(resolvedTarget, sourcePath);
  });
  target.appendChild(link);
}

function appendText(target: Node, text: string) {
  if (text) target.appendChild(document.createTextNode(text));
}

function findNextToken(source: string, start: number): InlineToken | null {
  for (let index = start; index < source.length; index += 1) {
    const token =
      parseCodeToken(source, index) ??
      parseWikiLinkToken(source, index) ??
      parseImageToken(source, index) ??
      parseLinkToken(source, index) ??
      parseDelimitedToken(source, index, "**", "strong") ??
      parseDelimitedToken(source, index, "__", "strong") ??
      parseDelimitedToken(source, index, "~~", "del") ??
      parseEmphasisToken(source, index, "*") ??
      parseEmphasisToken(source, index, "_");

    if (token) return token;
  }

  return null;
}

function appendImage(
  target: Node,
  token: Extract<InlineToken, { kind: "image" }>,
  options: MarkdownInlineRenderOptions,
) {
  const source = token.href.trim();
  if (isSafeMarkdownImageUrl(source)) {
    target.appendChild(createImageElement(source, token.alt, token.title, options.onLayoutChange));
    return;
  }

  const resolver = options.resolveAssetUrl ?? options.markdownAssetUrlResolver ?? null;
  if (!resolver) {
    target.appendChild(createImagePlaceholder(token.alt || token.href));
    return;
  }

  const placeholder = createImagePlaceholder("Loading image...");
  target.appendChild(placeholder);

  Promise.resolve(resolver(options.sourcePath ?? "", token.href))
    .then((resolvedUrl) => {
      if (!placeholder.isConnected) return;
      placeholder.replaceWith(
        resolvedUrl && isSafeMarkdownImageUrl(resolvedUrl)
          ? createImageElement(resolvedUrl, token.alt, token.title, options.onLayoutChange)
          : createImagePlaceholder(token.alt || token.href),
      );
      options.onLayoutChange?.();
    })
    .catch(() => {
      if (!placeholder.isConnected) return;
      placeholder.replaceWith(createImagePlaceholder(token.alt || token.href));
      options.onLayoutChange?.();
    });
}

function createImageElement(
  source: string,
  alt: string,
  title: string | null,
  onLayoutChange: (() => void) | undefined,
): HTMLImageElement {
  const image = document.createElement("img");
  image.src = source;
  image.alt = alt;
  image.loading = "lazy";
  if (title) image.title = title;
  image.addEventListener("load", () => onLayoutChange?.());
  image.addEventListener("error", () => onLayoutChange?.());
  return image;
}

function createImagePlaceholder(labelText: string): HTMLElement {
  const label = document.createElement("span");
  label.className = "cm-md-image-placeholder";
  label.textContent = labelText;
  return label;
}

function parseWikiLinkToken(source: string, from: number): InlineToken | null {
  if (!source.startsWith("[[", from)) return null;
  if (isEscaped(source, from)) return null;
  const token = findWikiLinkTokens(source.slice(from))[0] ?? null;
  if (!token || token.from !== 0) return null;
  const shiftedToken = {
    ...token,
    from: token.from + from,
    to: token.to + from,
    openingFrom: token.openingFrom + from,
    openingTo: token.openingTo + from,
    targetFrom: token.targetFrom + from,
    targetTo: token.targetTo + from,
    aliasFrom: token.aliasFrom === null ? null : token.aliasFrom + from,
    aliasTo: token.aliasTo === null ? null : token.aliasTo + from,
    closingFrom: token.closingFrom + from,
    closingTo: token.closingTo + from,
  };
  return {
    kind: "wikiLink",
    from: shiftedToken.from,
    to: shiftedToken.to,
    token: shiftedToken,
  };
}

function parseCodeToken(source: string, from: number): InlineToken | null {
  if (source[from] !== "`") return null;
  const to = source.indexOf("`", from + 1);
  if (to <= from + 1) return null;
  return {
    kind: "code",
    from,
    to: to + 1,
    text: source.slice(from + 1, to),
  };
}

function parseLinkToken(source: string, from: number): InlineToken | null {
  if (source[from] !== "[" || source[from - 1] === "!") return null;

  const labelTo = source.indexOf("]", from + 1);
  if (labelTo <= from + 1 || source[labelTo + 1] !== "(") return null;

  const hrefTo = findClosingParen(source, labelTo + 2);
  if (hrefTo <= labelTo + 2) return null;

  return {
    kind: "link",
    from,
    to: hrefTo + 1,
    label: source.slice(from + 1, labelTo),
    href: source.slice(labelTo + 2, hrefTo).trim(),
  };
}

function parseImageToken(source: string, from: number): InlineToken | null {
  const token = parseMarkdownImageTokenAt(source, from);
  if (!token) return null;

  return {
    kind: "image",
    from: token.from,
    to: token.to,
    alt: token.alt,
    href: token.href,
    title: token.title,
  };
}

function parseDelimitedToken(
  source: string,
  from: number,
  delimiter: string,
  kind: "del" | "strong",
): InlineToken | null {
  if (!source.startsWith(delimiter, from)) return null;

  const contentFrom = from + delimiter.length;
  const closingFrom = source.indexOf(delimiter, contentFrom);
  if (closingFrom <= contentFrom) return null;

  const text = source.slice(contentFrom, closingFrom);
  if (!text.trim()) return null;

  return {
    kind,
    from,
    to: closingFrom + delimiter.length,
    text,
  };
}

function parseEmphasisToken(source: string, from: number, delimiter: "*" | "_"): InlineToken | null {
  if (source[from] !== delimiter) return null;
  if (source[from + 1] === delimiter || source[from - 1] === delimiter) return null;

  const contentFrom = from + 1;
  let closingFrom = source.indexOf(delimiter, contentFrom);
  while (closingFrom > contentFrom && source[closingFrom + 1] === delimiter) {
    closingFrom = source.indexOf(delimiter, closingFrom + 2);
  }

  if (closingFrom <= contentFrom) return null;

  const text = source.slice(contentFrom, closingFrom);
  if (!text.trim()) return null;

  return {
    kind: "em",
    from,
    to: closingFrom + 1,
    text,
  };
}

function findClosingParen(source: string, start: number): number {
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === ")") return index;
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

function mightContainHtml(source: string): boolean {
  return /<\/?[a-z][\w:-]*(?:\s+[^<>]*)?>|<br\s*\/?>/i.test(source);
}

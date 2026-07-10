import type { MarkdownInlineHtml } from "../semantic/inlineHtmlModel";
import {
  isAllowedStyleProperty,
  isSafeStyleValue,
} from "./markdownHtmlPolicy";

const LIVE_INLINE_HTML_TAGS = new Set([
  "b",
  "code",
  "del",
  "em",
  "i",
  "mark",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
]);

const LIVE_INLINE_HTML_ATTRIBUTES = new Set([
  "aria-label",
  "style",
  "title",
]);

export type SafeInlineHtmlMark = {
  kind: "mark";
  tagName: string;
  attributes: Readonly<Record<string, string>>;
};

export type SafeInlineHtmlLineBreak = {
  kind: "lineBreak";
};

export type SafeInlineHtmlRenderPlan = SafeInlineHtmlMark | SafeInlineHtmlLineBreak;

export type InlineHtmlPolicyResult =
  | { supported: true; value: SafeInlineHtmlRenderPlan }
  | { supported: false; reasons: readonly string[] };

export function compileInlineHtmlRenderPlan(element: MarkdownInlineHtml): InlineHtmlPolicyResult {
  const reasons: string[] = [];
  if (element.status !== "complete") {
    reasons.push(`inline <${element.tagName}> is not complete`);
  }

  const isStandalone = !element.contentRange && !element.closingMarker;
  if (isStandalone) {
    if (element.tagName !== "br") {
      reasons.push(`standalone inline <${element.tagName}> is not supported`);
    }
    if (element.attributes.length > 0) {
      reasons.push(`attributes on inline <${element.tagName}> are not supported`);
    }
    return reasons.length > 0
      ? { supported: false, reasons: Array.from(new Set(reasons)) }
      : { supported: true, value: { kind: "lineBreak" } };
  }

  if (!element.contentRange || !element.closingMarker) {
    reasons.push(`inline <${element.tagName}> is not complete`);
  }
  if (!LIVE_INLINE_HTML_TAGS.has(element.tagName)) {
    reasons.push(`inline <${element.tagName}> is not supported`);
  }

  const attributes: Record<string, string> = {};
  const seenAttributes = new Set<string>();
  for (const attribute of element.attributes) {
    if (seenAttributes.has(attribute.name)) {
      reasons.push(`duplicate attribute "${attribute.name}" is not supported`);
      continue;
    }
    seenAttributes.add(attribute.name);

    if (attribute.name.startsWith("on")) {
      reasons.push(`event handler "${attribute.name}" is not supported`);
      continue;
    }
    if (!LIVE_INLINE_HTML_ATTRIBUTES.has(attribute.name)) {
      reasons.push(`attribute "${attribute.name}" is not supported`);
      continue;
    }
    if (attribute.value === null) {
      reasons.push(`attribute "${attribute.name}" requires a value`);
      continue;
    }

    if (attribute.name === "style") {
      const styleResult = compileInlineStyle(attribute.value);
      if (!styleResult.supported) {
        reasons.push(...styleResult.reasons);
        continue;
      }
      if (styleResult.value) attributes.style = styleResult.value;
      continue;
    }

    attributes[attribute.name] = decodeHtmlAttributeValue(attribute.value);
  }

  if (reasons.length > 0) {
    return { supported: false, reasons: Array.from(new Set(reasons)) };
  }
  return {
    supported: true,
    value: {
      kind: "mark",
      tagName: element.tagName,
      attributes,
    },
  };
}

type InlineStyleResult =
  | { supported: true; value: string }
  | { supported: false; reasons: readonly string[] };

function compileInlineStyle(source: string): InlineStyleResult {
  const declarations: string[] = [];
  const reasons: string[] = [];
  const seenProperties = new Set<string>();

  for (const rawDeclaration of source.split(";")) {
    const declaration = rawDeclaration.trim();
    if (!declaration) continue;

    const separator = declaration.indexOf(":");
    if (separator <= 0) {
      reasons.push(`style declaration "${declaration}" is malformed`);
      continue;
    }

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = decodeHtmlAttributeValue(declaration.slice(separator + 1).trim());
    if (!/^[a-z-]+$/.test(property)) {
      reasons.push(`style property "${property}" is malformed`);
      continue;
    }
    if (seenProperties.has(property)) {
      reasons.push(`duplicate style "${property}" is not supported`);
      continue;
    }
    seenProperties.add(property);

    if (!isAllowedStyleProperty(property, "inline")) {
      reasons.push(`style "${property}" is not supported in the editor`);
      continue;
    }
    if (!isSafeStyleValue(property, value)) {
      reasons.push(`style value for "${property}" is not supported`);
      continue;
    }
    declarations.push(`${property}: ${value}`);
  }

  if (reasons.length > 0) {
    return { supported: false, reasons: Array.from(new Set(reasons)) };
  }
  return { supported: true, value: declarations.join("; ") };
}

function decodeHtmlAttributeValue(value: string): string {
  const named = new Map<string, string>([
    ["amp", "&"],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["nbsp", "\u00a0"],
    ["quot", "\""],
  ]);

  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi, (match, decimal, hex, name) => {
    if (name) return named.get(String(name).toLowerCase()) ?? match;
    const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
    if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      return "\ufffd";
    }
    return String.fromCodePoint(codePoint);
  });
}

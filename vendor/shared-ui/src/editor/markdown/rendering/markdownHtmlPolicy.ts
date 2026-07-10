import {
  getInlineEditableProfile,
  getSafeBlockProfile,
  getSafeMediaProfile,
  isAttributeAllowedInProfile,
  isBlockedExecutableTag,
  isStylePropertyAllowedInProfile,
  isTagAllowedInProfile,
} from "../policy/markdownHtmlProfiles";
import { isSafeHref as isSafeHrefFromPolicy } from "../policy/markdownUrlPolicy";

export type HtmlSanitizerMode = "inline" | "block";

/**
 * Compatibility surface for older call sites. Tag/attribute/style allowlists
 * are owned exclusively by markdownHtmlProfiles — this object mirrors them
 * and must not invent additional capabilities.
 */
export const MARKDOWN_HTML_POLICY = {
  tags: {
    get inline() { return getInlineEditableProfile().tags; },
    get block() { return getSafeBlockProfile().tags; },
    get blocked() {
      return new Set([
        "base", "embed", "form", "iframe", "input", "link", "meta", "object", "script", "style", "template",
      ]);
    },
    get void() { return getSafeBlockProfile().voidTags; },
  },
  attributes: {
    get global() { return getSafeBlockProfile().attributes.global; },
    get byTag() { return getSafeBlockProfile().attributes.byTag; },
    boolean: new Map<string, Set<string>>([
      ["details", new Set(["open"])],
      ["audio", new Set(["controls"])],
      ["video", new Set(["controls"])],
    ]),
    numeric: new Map<string, Set<string>>([
      ["td", new Set(["colspan", "rowspan"])],
      ["th", new Set(["colspan", "rowspan"])],
    ]),
  },
  styles: {
    get inlineProperties() { return getInlineEditableProfile().styleProperties; },
    get blockProperties() { return getSafeBlockProfile().styleProperties; },
  },
  urls: {
    protocols: new Set(["http:", "https:", "mailto:"]),
    relativePrefixes: ["#", "/", "./", "../"],
  },
} as const;

export function isAllowedHtmlTag(tagName: string, mode: HtmlSanitizerMode): boolean {
  return isTagAllowedInProfile(tagName, mode);
}

export function isBlockedHtmlTag(tagName: string): boolean {
  return isBlockedExecutableTag(tagName);
}

export function isVoidHtmlTag(tagName: string): boolean {
  return (
    getInlineEditableProfile().voidTags.has(tagName) ||
    getSafeBlockProfile().voidTags.has(tagName) ||
    getSafeMediaProfile().voidTags.has(tagName)
  );
}

export function isAllowedHtmlAttribute(tagName: string, attributeName: string, mode: HtmlSanitizerMode = "block"): boolean {
  return isAttributeAllowedInProfile(tagName, attributeName, mode);
}

export function isBooleanHtmlAttribute(tagName: string, attributeName: string): boolean {
  return MARKDOWN_HTML_POLICY.attributes.boolean.get(tagName)?.has(attributeName) === true;
}

export function isNumericHtmlAttribute(tagName: string, attributeName: string): boolean {
  return MARKDOWN_HTML_POLICY.attributes.numeric.get(tagName)?.has(attributeName) === true;
}

export function isAllowedStyleProperty(
  property: string,
  mode: HtmlSanitizerMode = "block",
  tagName?: string,
): boolean {
  return isStylePropertyAllowedInProfile(property, mode, tagName);
}

export function isSafeHref(href: string): boolean {
  return isSafeHrefFromPolicy(href);
}

export function isSafeStyleValue(property: string, value: string): boolean {
  const normalized = value.trim();
  if (!normalized || /[;<>{}]|url\s*\(|expression\s*\(|@import/i.test(normalized)) return false;
  if (isSafeCssVariableValue(normalized)) return true;

  if (property === "color" || property.endsWith("-color")) {
    return isSafeColorValue(normalized);
  }

  if (property === "background") {
    return isSafeColorValue(normalized);
  }

  if (property === "font-weight") {
    return /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(normalized);
  }

  if (property === "font-style") {
    return /^(normal|italic|oblique)$/i.test(normalized);
  }

  if (property === "text-decoration" || property === "text-decoration-line") {
    return /^(none|underline|line-through|underline line-through|line-through underline)$/i.test(normalized);
  }

  if (property === "display") {
    const normalizedDisplay = normalized.toLowerCase();
    // Hiding content is never an honest broad-safe presentation.
    if (normalizedDisplay === "none") return false;
    return /^(block|flex|grid|inline|inline-block|inline-flex|inline-grid)$/i.test(normalized);
  }

  if (property === "flex-wrap") {
    return /^(nowrap|wrap|wrap-reverse)$/i.test(normalized);
  }

  if (property === "overflow") {
    return /^(auto|hidden|scroll|visible)$/i.test(normalized);
  }

  if (property === "cursor") {
    return /^(default|pointer|text)$/i.test(normalized);
  }

  if (property === "text-align") {
    return /^(left|center|right|start|end)$/i.test(normalized);
  }

  if (property === "vertical-align") {
    return /^(baseline|sub|super|top|middle|bottom|text-top|text-bottom)$/i.test(normalized);
  }

  if (property === "letter-spacing") {
    return isSafeLengthValue(normalized) || /^normal$/i.test(normalized);
  }

  if (property.startsWith("border")) {
    return normalized
      .split(/\s+/)
      .every((part) => isSafeLengthValue(part) || isSafeColorValue(part) || /^(none|solid|dashed|dotted)$/i.test(part));
  }

  if (property === "font-size" || property === "line-height") {
    return isSafeLengthValue(normalized) || /^(normal|small|medium|large|x-large|xx-large|smaller|larger)$/i.test(normalized);
  }

  if (
    property === "gap" ||
    property === "height" ||
    property === "margin" ||
    property.startsWith("margin-") ||
    property === "max-width" ||
    property === "min-width" ||
    property === "padding" ||
    property.startsWith("padding-") ||
    property === "width"
  ) {
    return normalized.split(/\s+/).every(isSafeLengthValue);
  }

  return false;
}

function isSafeColorValue(value: string): boolean {
  return (
    /^#[0-9a-f]{3,8}$/i.test(value) ||
    /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*(?:[\d.]+|[\d.]+%))?\s*\)$/i.test(value) ||
    /^hsla?\(\s*[\d.]+(?:deg|rad|turn)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*(?:[\d.]+|[\d.]+%))?\s*\)$/i.test(value) ||
    isSafeCssVariableValue(value) ||
    /^(currentcolor|transparent|black|blue|brown|cyan|gray|green|grey|lime|magenta|maroon|navy|olive|orange|pink|purple|red|teal|white|yellow)$/i.test(value)
  );
}

function isSafeLengthValue(value: string): boolean {
  return (
    /^0$/.test(value) ||
    /^-?\d*\.?\d+(?:px|em|rem|%|vh|vw|ch|lh)$/i.test(value) ||
    /^auto$/i.test(value) ||
    isSafeCssVariableValue(value)
  );
}

function isSafeCssVariableValue(value: string): boolean {
  const match = /^var\(\s*(--[a-z0-9_-]+)(?:\s*,\s*(.+))?\s*\)$/i.exec(value);
  if (!match) return false;

  const fallback = match[2]?.trim();
  if (!fallback) return true;
  if (/[;<>{}]|url\s*\(|expression\s*\(|@import/i.test(fallback)) return false;

  return (
    /^#[0-9a-f]{3,8}$/i.test(fallback) ||
    /^-?\d*\.?\d+(?:px|em|rem|%|vh|vw|ch|lh)$/i.test(fallback) ||
    /^(currentcolor|transparent|black|blue|brown|cyan|gray|green|grey|lime|magenta|maroon|navy|olive|orange|pink|purple|red|teal|white|yellow)$/i.test(fallback)
  );
}

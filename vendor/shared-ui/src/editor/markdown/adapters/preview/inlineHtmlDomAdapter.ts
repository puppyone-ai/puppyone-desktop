import { compileInlineHtmlRenderPlan } from "../../policy/inlineHtmlPolicy";
import type { MarkdownInlineHtml } from "../../semantic/inlineHtmlModel";
import { scanMarkdownHtmlTagTokens } from "../../semantic/htmlTagTokenizer";

/**
 * Shared table-cell / preview helper: compile a single complete inline HTML
 * element through the same policy authority as live preview, then apply typed
 * attributes to a DOM element. Falls back to null when unsupported.
 */
export function createDomFromInlineHtmlSource(source: string): HTMLElement | null {
  const trimmed = source.trim();
  const tokens = scanMarkdownHtmlTagTokens(trimmed);
  const open = tokens.find((token) => !token.closing && !token.selfClosing);
  const close = tokens.find((token) => token.closing && token.tagName === open?.tagName);
  if (!open || !close || close.from <= open.to) return null;

  const element: MarkdownInlineHtml = {
    kind: "inlineHtml",
    from: open.from,
    to: close.to,
    tagName: open.tagName,
    openingMarker: { from: open.from, to: open.to },
    contentRange: { from: open.to, to: close.from },
    closingMarker: { from: close.from, to: close.to },
    attributes: open.attributes,
    status: "complete",
    containerFrom: 0,
    containerTo: trimmed.length,
  };

  const policy = compileInlineHtmlRenderPlan(element);
  if (!policy.supported || policy.value.kind !== "mark") return null;

  const node = document.createElement(policy.value.tagName);
  node.classList.add("cm-md-inline-html");
  for (const [name, value] of Object.entries(policy.value.attributes)) {
    node.setAttribute(name, value);
  }
  node.textContent = trimmed.slice(open.to, close.from);
  return node;
}

export type MarkdownLinkToken = {
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
  hrefFrom: number;
  hrefTo: number;
  label: string;
  href: string;
};

export function findMarkdownLinkTokens(source: string): MarkdownLinkToken[] {
  const tokens: MarkdownLinkToken[] = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[" || source[index - 1] === "!" || isEscaped(source, index)) continue;

    const labelTo = findClosingBracket(source, index + 1);
    if (labelTo <= index + 1 || source[labelTo + 1] !== "(") continue;

    const hrefFrom = labelTo + 2;
    const hrefTo = findClosingParen(source, hrefFrom);
    if (hrefTo <= hrefFrom) continue;

    const rawLabel = source.slice(index + 1, labelTo);
    const rawDestination = source.slice(hrefFrom, hrefTo);
    const href = parseMarkdownLinkDestination(rawDestination);
    if (!rawLabel.trim() || !href) continue;

    tokens.push({
      from: index,
      to: hrefTo + 1,
      labelFrom: index + 1,
      labelTo,
      hrefFrom,
      hrefTo,
      label: rawLabel,
      href,
    });
    index = hrefTo;
  }

  return tokens;
}

export function isExternalMarkdownHref(href: string): boolean {
  const value = href.trim();
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

function findClosingBracket(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\n") return -1;
    if (character === "]" && !isEscaped(source, index)) return index;
  }
  return -1;
}

function findClosingParen(source: string, start: number): number {
  let escaped = false;
  let quote: "\"" | "'" | null = null;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\n") return -1;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function parseMarkdownLinkDestination(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const angleDestination = /^<([^>\n]+)>(?:\s+["'][^"']*["'])?$/.exec(trimmed);
  if (angleDestination) return angleDestination[1].trim() || null;

  const titleStart = findTrailingTitleStart(trimmed);
  const href = (titleStart == null ? trimmed : trimmed.slice(0, titleStart)).trim();
  return href || null;
}

function findTrailingTitleStart(value: string): number | null {
  const quote = value[value.length - 1];
  if (quote !== "\"" && quote !== "'") return null;

  for (let index = value.length - 2; index >= 0; index -= 1) {
    if (value[index] !== quote || isEscaped(value, index)) continue;
    const beforeTitle = value.slice(0, index).trimEnd();
    if (!beforeTitle || beforeTitle.length === index) return null;
    return index;
  }

  return null;
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

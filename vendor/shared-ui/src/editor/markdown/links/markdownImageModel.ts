import type { MarkdownAssetUrlResolver } from "../../viewerTypes";

export type MarkdownImageToken = {
  from: number;
  to: number;
  alt: string;
  href: string;
  title: string | null;
};

const OBSIDIAN_IMAGE_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

export function findMarkdownImageTokens(source: string): MarkdownImageToken[] {
  const tokens: MarkdownImageToken[] = [];

  for (let index = 0; index < source.length;) {
    if (!source.startsWith("![", index) || isEscaped(source, index)) {
      index += 1;
      continue;
    }

    const token = parseObsidianImageEmbed(source, index) ?? parseStandardMarkdownImage(source, index);
    if (!token) {
      index += 2;
      continue;
    }

    tokens.push(token);
    index = token.to;
  }

  return tokens;
}

function parseStandardMarkdownImage(source: string, from: number): MarkdownImageToken | null {
  const labelFrom = from + 2;
  const labelTo = findClosingBracket(source, labelFrom);
  if (labelTo < 0 || source[labelTo + 1] !== "(") return null;

  const destinationFrom = labelTo + 2;
  const destinationTo = findClosingParen(source, destinationFrom);
  if (destinationTo <= destinationFrom) return null;

  const parsed = parseMarkdownImageDestination(source.slice(destinationFrom, destinationTo));
  if (!parsed) return null;

  return {
    from,
    to: destinationTo + 1,
    alt: source.slice(labelFrom, labelTo),
    href: parsed.href,
    title: parsed.title,
  };
}

function parseObsidianImageEmbed(source: string, from: number): MarkdownImageToken | null {
  if (!source.startsWith("![[", from)) return null;

  const contentFrom = from + 3;
  const closingFrom = source.indexOf("]]", contentFrom);
  if (closingFrom === -1) return null;

  const content = source.slice(contentFrom, closingFrom);
  if (!content.trim() || content.includes("\n")) return null;

  const pipeOffset = findUnescapedPipe(content);
  const rawTarget = pipeOffset === -1 ? content : content.slice(0, pipeOffset);
  const href = rawTarget.trim();
  if (!href || !isObsidianImageTarget(href)) return null;

  const rawAlias = pipeOffset === -1 ? "" : content.slice(pipeOffset + 1).trim();
  const alt = rawAlias && !isObsidianEmbedSize(rawAlias) ? rawAlias : href;

  return {
    from,
    to: closingFrom + 2,
    alt,
    href,
    title: null,
  };
}

function parseMarkdownImageDestination(value: string): { href: string; title: string | null } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const angleDestination = /^<([^>\n]+)>(?:\s+["']([^"']*)["'])?$/.exec(trimmed);
  if (angleDestination) {
    return {
      href: angleDestination[1],
      title: angleDestination[2] ?? null,
    };
  }

  const quotedTitle = findTrailingQuotedTitle(trimmed);
  if (quotedTitle) {
    return {
      href: quotedTitle.href,
      title: quotedTitle.title,
    };
  }

  return {
    href: trimmed,
    title: null,
  };
}

function findClosingBracket(source: string, from: number): number {
  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\n") return -1;
    if (character === "]" && !isEscaped(source, index)) return index;
  }
  return -1;
}

function findClosingParen(source: string, from: number): number {
  let depth = 0;
  let quote: "\"" | "'" | null = null;

  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\n") return -1;
    if (isEscaped(source, index)) continue;

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

function findTrailingQuotedTitle(value: string): { href: string; title: string } | null {
  const quote = value[value.length - 1];
  if (quote !== "\"" && quote !== "'") return null;

  for (let index = value.length - 2; index >= 0; index -= 1) {
    if (value[index] !== quote || isEscaped(value, index)) continue;

    const href = value.slice(0, index).trim();
    const title = value.slice(index + 1, -1);
    if (!href) return null;
    return { href, title };
  }

  return null;
}

function isObsidianImageTarget(value: string): boolean {
  const normalized = value.split(/[?#]/, 1)[0]?.trim().toLowerCase() ?? "";
  const extension = /\.([a-z0-9]+)$/.exec(normalized)?.[1] ?? "";
  return OBSIDIAN_IMAGE_EXTENSIONS.has(extension);
}

function isObsidianEmbedSize(value: string): boolean {
  return /^\d+(?:x\d+)?$/i.test(value.trim());
}

function findUnescapedPipe(content: string): number {
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscaped(content, index)) return index;
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

export function resolveMarkdownAssetPath(sourcePath: string, href: string): string | null {
  const trimmedHref = href.trim();
  if (!trimmedHref || isSafeMarkdownImageUrl(trimmedHref)) return null;
  if (trimmedHref.startsWith("#") || trimmedHref.startsWith("\\") || hasUrlScheme(trimmedHref)) return null;

  const sourceParts = sourcePath.split(/[\\/]+/).filter(Boolean);
  if (!trimmedHref.startsWith("/")) sourceParts.pop();

  const parts = trimmedHref.startsWith("/") ? [] : [...sourceParts];
  for (const segment of stripMarkdownUrlSuffix(trimmedHref).split(/[\\/]+/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(decodeMarkdownPathSegment(segment));
  }

  return parts.length > 0 ? parts.join("/") : null;
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function stripMarkdownUrlSuffix(value: string): string {
  const suffixIndex = value.search(/[?#]/);
  return suffixIndex === -1 ? value : value.slice(0, suffixIndex);
}

function decodeMarkdownPathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function isSafeMarkdownImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(https?:|data:image\/|blob:|puppyone-local:)/i.test(trimmed)) return true;
  return false;
}

export function isSafeMarkdownImageSrcset(value: string): boolean {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .every((candidate) => {
      const [url] = candidate.split(/\s+/);
      return url ? isSafeMarkdownImageUrl(url) : false;
    });
}

export async function resolveMarkdownHtmlImageSources(
  source: string,
  documentPath: string,
  resolver: MarkdownAssetUrlResolver | null,
): Promise<string> {
  if (!resolver || !/<img\b/i.test(source)) return source;

  const template = document.createElement("template");
  template.innerHTML = source;
  const images = Array.from(template.content.querySelectorAll<HTMLImageElement>("img"));
  if (images.length === 0) return source;

  await Promise.all(images.map(async (image) => {
    const src = image.getAttribute("src");
    if (src && !isSafeMarkdownImageUrl(src)) {
      const resolvedUrl = await resolver(documentPath, src);
      if (resolvedUrl && isSafeMarkdownImageUrl(resolvedUrl)) image.setAttribute("src", resolvedUrl);
      else image.removeAttribute("src");
    }

    const srcset = image.getAttribute("srcset");
    if (srcset) {
      const resolvedSrcset = await resolveMarkdownImageSrcset(srcset, documentPath, resolver);
      if (resolvedSrcset) image.setAttribute("srcset", resolvedSrcset);
      else image.removeAttribute("srcset");
    }
  }));

  return template.innerHTML;
}

async function resolveMarkdownImageSrcset(
  value: string,
  documentPath: string,
  resolver: MarkdownAssetUrlResolver,
): Promise<string | null> {
  const entries = await Promise.all(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(async (candidate) => {
        const parsed = /^(\S+)(.*)$/.exec(candidate);
        if (!parsed) return null;

        if (isSafeMarkdownImageUrl(parsed[1])) return candidate;

        const resolvedUrl = await resolver(documentPath, parsed[1]);
        if (!resolvedUrl || !isSafeMarkdownImageUrl(resolvedUrl)) return null;
        return `${resolvedUrl}${parsed[2] ?? ""}`;
      }),
  );

  return entries.every(Boolean) ? entries.join(", ") : null;
}

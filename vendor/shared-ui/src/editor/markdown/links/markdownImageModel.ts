import type { MarkdownAssetUrlResolver } from "../../viewerTypes";

export type MarkdownImageToken = {
  from: number;
  to: number;
  alt: string;
  href: string;
  title: string | null;
};

const IMAGE_PATTERN = /!\[([^\]\n]*)\]\(([^)\n]+)\)/g;

export function findMarkdownImageTokens(source: string): MarkdownImageToken[] {
  const tokens: MarkdownImageToken[] = [];

  for (const match of source.matchAll(IMAGE_PATTERN)) {
    if (match.index == null) continue;
    const parsed = parseMarkdownImageDestination(match[2]);
    if (!parsed) continue;

    tokens.push({
      from: match.index,
      to: match.index + match[0].length,
      alt: match[1],
      href: parsed.href,
      title: parsed.title,
    });
  }

  return tokens;
}

function parseMarkdownImageDestination(value: string): { href: string; title: string | null } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const titleMatch = /^(\S+)(?:\s+["']([^"']*)["'])?$/.exec(trimmed);
  if (!titleMatch) return { href: trimmed, title: null };

  return {
    href: titleMatch[1],
    title: titleMatch[2] ?? null,
  };
}

export function resolveMarkdownAssetPath(sourcePath: string, href: string): string | null {
  const trimmedHref = href.trim();
  if (!trimmedHref || isSafeMarkdownImageUrl(trimmedHref)) return null;
  if (trimmedHref.startsWith("#") || trimmedHref.startsWith("/") || trimmedHref.startsWith("\\")) return null;

  const sourceParts = sourcePath.split(/[\\/]+/).filter(Boolean);
  sourceParts.pop();

  const parts = [...sourceParts];
  for (const segment of trimmedHref.split(/[\\/]+/)) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }

  return parts.length > 0 ? parts.join("/") : null;
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

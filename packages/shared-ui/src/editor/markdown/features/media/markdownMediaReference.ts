import type { MarkdownLinkGraph } from "../../../registry/viewerTypes";
import type { MarkdownMediaReferenceKind } from "../../core/features/markdownFeatureData";
export type { MarkdownMediaReferenceKind } from "../../core/features/markdownFeatureData";
import {
  resolveWorkspaceRelativePath,
  type MarkdownAssetKind,
} from "../../platform/policy/markdownAssetPolicy";
import {
  createResourceUri,
  createWorkspaceResourceUri,
  getWorkspaceResourcePath,
  parseResourceUri,
} from "../../../../core/resourceUri";
import { isDataResourceUri } from "../../../../core/dataResourcePath";

/**
 * The narrow URL-resolution contract shared by media renderers. The required
 * kind selects the matching AssetBroker policy without coupling
 * image, video, or sanitized-HTML widgets to one another.
 */
export type BrokeredMarkdownMediaUrlResolver = (
  documentPath: string,
  href: string,
  kind: MarkdownAssetKind,
  signal?: AbortSignal,
) => string | null | Promise<string | null>;

/** Public host adapter for resolving any authored Markdown media path. */
export function resolveMarkdownAssetPath(sourcePath: string, href: string): string | null {
  if (isDataResourceUri(sourcePath)) {
    const parsed = parseResourceUri(sourcePath);
    const rootSegment = parsed.path.split("/").filter(Boolean)[0];
    if (!rootSegment) return null;
    const rootUri = createResourceUri({ ...parsed, path: rootSegment });
    const providerSourcePath = getWorkspaceResourcePath(rootUri, sourcePath);
    const providerAssetPath = resolveWorkspaceRelativePath(providerSourcePath, href);
    return providerAssetPath ? createWorkspaceResourceUri(rootUri, providerAssetPath) : null;
  }
  return resolveWorkspaceRelativePath(sourcePath, href);
}

/**
 * Converts authored media syntax into the href understood by AssetBroker.
 * Standard Markdown paths remain document-relative. Obsidian embeds first use
 * the workspace link index and become an explicit workspace-root href, so a
 * basename link does not accidentally resolve relative to the current note.
 */
export function resolveMarkdownMediaReference(
  sourcePath: string,
  href: string,
  referenceKind: MarkdownMediaReferenceKind,
  linkGraph: MarkdownLinkGraph | null,
): string | null {
  if (referenceKind === "markdown-path") return href;

  const resolved = linkGraph?.resolveWikiLink(sourcePath, href) ?? null;
  if (resolved?.ambiguous) return null;
  if (resolved?.exists && resolved.path) return toWorkspaceRootHref(resolved.path);

  // An explicit Obsidian path is vault/workspace-root relative even while the
  // metadata index is still warming. A bare filename keeps a same-folder
  // fallback, then upgrades to the indexed target on the next graph refresh.
  const authoredPath = href.split(/[?#]/, 1)[0]?.trim().replace(/\\/g, "/") ?? "";
  if (!authoredPath) return null;
  return authoredPath.includes("/") ? toWorkspaceRootHref(authoredPath) : authoredPath;
}

function toWorkspaceRootHref(path: string): string {
  return `/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

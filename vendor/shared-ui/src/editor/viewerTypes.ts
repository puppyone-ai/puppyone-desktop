import type { ReactNode } from "react";
import type { AppPreviewController, OfficeDocumentConverter } from "../core/types";
import type { FileFormat } from "../core/fileFormats";
import type { FileIconThemeId } from "../file/fileIcons";
import type { AiEditFile } from "./ai-edits/types";
import type {
  CoreViewerCapability,
  PresetViewerContractVersion,
  PresetViewerRuntime,
  PresetViewerSource,
} from "./viewerContract";
import type {
  DocumentSourceKind,
  ViewerContribution,
  ViewerPackSnapshot,
} from "./viewerPackTypes";

export type { DocumentSourceKind } from "./viewerPackTypes";

export type EditorDocumentKind =
  | "folder"
  | "app"
  | "markdown"
  | "json"
  | "html"
  | "image"
  | "audio"
  | "pdf"
  | "video"
  | "spreadsheet"
  | "archive"
  | "document"
  | "binary"
  | "code"
  | "text"
  | "file"
  | string;

export type EditorDocument = {
  path: string;
  name: string;
  type: EditorDocumentKind;
  content?: string | null;
  preview?: string | null;
  mimeType?: string | null;
  url?: string | null;
  /**
   * Where the document was sourced. Plugin routing fails closed for `cloud`
   * and `unknown`; only explicit `local` documents can activate a Viewer Pack.
   */
  sourceKind?: DocumentSourceKind;
};

/**
 * A host-provided callback that renders the native/sandboxed surface slot for
 * an activated plugin session. Dependency-injected by the desktop shell so
 * shared-ui never imports Electron or spawns a session itself.
 */
export type ExternalViewerSurfaceRenderer = (
  request: ExternalViewerSurfaceRequest,
) => ReactNode;

export type ExternalViewerSurfaceRequest = {
  document: EditorDocument;
  contribution: ViewerContribution;
};

export type EditorMode = "live" | "source";
export type EditorSaveMode = "manual" | "auto";
export type EditorSourceRequirement = PresetViewerSource;
export type MarkdownHtmlTrustMode = "safe" | "localTrusted";

export type MarkdownWikiLinkResolvedTarget = {
  exists: boolean;
  ambiguous: boolean;
  path: string | null;
  candidatePaths?: string[];
  name: string;
  displayName: string;
  target: string;
  heading?: string | null;
};

export type MarkdownBacklinkReference = {
  lineNumber: number;
  lineText: string;
  target: string;
  label: string;
};

export type MarkdownBacklink = {
  sourcePath: string;
  sourceName: string;
  count: number;
  references: MarkdownBacklinkReference[];
};

export type MarkdownLinkGraph = {
  documentCount: number;
  indexedDocumentCount: number;
  isIndexing: boolean;
  resolveWikiLink: (sourcePath: string, target: string) => MarkdownWikiLinkResolvedTarget;
  resolveMarkdownLink: (sourcePath: string, href: string) => MarkdownWikiLinkResolvedTarget | null;
  openWikiLink?: (target: MarkdownWikiLinkResolvedTarget, sourcePath: string) => void;
  openPath?: (path: string) => void;
  openExternalUrl?: (href: string) => void | Promise<void>;
  getBacklinks?: (path: string) => MarkdownBacklink[];
};

export type MarkdownResolvedAssetUrl = {
  url: string;
  revoke?: () => void | Promise<void>;
};

export type MarkdownAssetUrlResolver = (
  sourcePath: string,
  href: string,
  signal?: AbortSignal,
) =>
  | string
  | MarkdownResolvedAssetUrl
  | null
  | Promise<string | MarkdownResolvedAssetUrl | null>;

export type EditorViewerMatch = {
  document: EditorDocument;
  format: FileFormat;
  resolvedExtension: string | null;
};

export type EditorViewerContext = EditorViewerMatch & {
  content: string;
  aiEditFile?: AiEditFile | null;
  fileUrl?: string | null;
  fileUrlLoading: boolean;
  fileUrlError?: string | null;
  loading: boolean;
  error?: string | null;
  canEdit: boolean;
  hideSourceView: boolean;
  fileIconTheme: FileIconThemeId;
  saveMode: EditorSaveMode;
  htmlTrustMode: MarkdownHtmlTrustMode;
  workspaceId?: string;
  workspaceRoot?: string | null;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  onSaveContent?: (content: string) => Promise<void>;
  /** Immutable, validated snapshot of enabled viewer-pack contributions. */
  viewerPackSnapshot?: ViewerPackSnapshot | null;
  /** Host-provided renderer for an activated plugin surface (DI, not Electron). */
  externalViewerSurface?: ExternalViewerSurfaceRenderer | null;
};

/**
 * Versioned contract for a viewer that ships with PuppyOne. Contributions are
 * registered in deterministic order and must not embed format-extension data.
 */
export type PresetViewerContribution = Readonly<{
  contractVersion: PresetViewerContractVersion;
  id: string;
  capability: CoreViewerCapability;
  source: EditorSourceRequirement;
  runtime: PresetViewerRuntime;
  match: (match: EditorViewerMatch) => boolean;
  allowPreviewContent?: boolean;
  normalizeContent?: (content: string, document: EditorDocument) => string;
  isEditable?: (match: EditorViewerMatch & { content: string }) => boolean;
  render: (context: EditorViewerContext) => ReactNode;
}>;

/** @deprecated Prefer the product-semantic PresetViewerContribution name. */
export type EditorViewer = PresetViewerContribution;

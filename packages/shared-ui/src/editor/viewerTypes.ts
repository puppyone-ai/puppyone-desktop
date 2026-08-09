import type { ComponentType, ReactNode } from "react";
import type { AppPreviewController, OfficeDocumentConverter } from "../core/types";
import type { FileFormat } from "../core/fileFormats";
import type { FileIconThemeId } from "../file/fileIcons";
import type { AiEditFile } from "./ai-edits/types";
import type { PresetViewerSource } from "./viewerContract";
import type { DocumentSourceKind } from "./documentSource";
import type { PresetViewerDefinition } from "./presetViewerManifest";

export type { DocumentSourceKind } from "./documentSource";

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
  version?: string | null;
  /** Explicit project/document Markdown grammar assignment from the Host. */
  markdownDialect?: MarkdownDialectId | null;
  /**
   * Where the document was sourced. Plugin routing fails closed for `cloud`
   * and `unknown`; only explicit `local` documents can activate a Viewer Pack.
   */
  sourceKind?: DocumentSourceKind;
};

export type EditorMode = "live" | "source";
export type EditorSaveMode = "manual" | "auto";
export type EditorInteractionPreferences = Readonly<{
  showSaveStatus: boolean;
  markdownBlockDragEnabled: boolean;
}>;
export const DEFAULT_EDITOR_INTERACTION_PREFERENCES: EditorInteractionPreferences = {
  showSaveStatus: false,
  markdownBlockDragEnabled: false,
};
export type EditorSourceRequirement = PresetViewerSource;
export type MarkdownHtmlTrustMode = "safe" | "localTrusted";
export type MarkdownDialectId = "puppy-gfm" | "openknowledge-mdx";

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

/**
 * Host-owned handoff into an optional Office editor extension. The action is
 * deliberately opaque to shared-ui: plugins keep session, persistence, and
 * native-surface authority outside the built-in read-only preview.
 */
export type OfficeEditorAction = Readonly<{
  id: string;
  label: string;
  activate: () => void | Promise<void>;
}>;

export type OfficeEditorActionResolver = (
  document: EditorDocument,
) => readonly OfficeEditorAction[];

export type EditorViewerMatch = {
  document: EditorDocument;
  format: FileFormat;
  resolvedExtension: string | null;
};

export type PresetViewerRenderContext = EditorViewerMatch & {
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
  editorInteractionPreferences: EditorInteractionPreferences;
  htmlTrustMode: MarkdownHtmlTrustMode;
  workspaceId?: string;
  workspaceRoot?: string | null;
  markdownLinkGraph?: MarkdownLinkGraph | null;
  markdownAssetUrlResolver?: MarkdownAssetUrlResolver | null;
  appPreview?: AppPreviewController | null;
  openExternalFile?: (path: string) => Promise<void>;
  convertOfficeDocumentToDocx?: OfficeDocumentConverter;
  officeEditorActions?: readonly OfficeEditorAction[];
};

/** @deprecated Prefer PresetViewerRenderContext. */
export type EditorViewerContext = PresetViewerRenderContext;

type PresetViewerImplementationBase = Readonly<{
  id: string;
  match: (match: EditorViewerMatch) => boolean;
  allowPreviewContent?: boolean;
  normalizeContent?: (content: string, document: EditorDocument) => string;
  /**
   * Format-specific runtime veto for an edit-capable contribution. This may
   * narrow access only; the Host separately enforces Viewer capability,
   * FileFormat.editable, canonical-source readiness, and persistence authority.
   */
  isEditable?: (match: EditorViewerMatch & { content: string }) => boolean;
}>;

export type EagerPresetViewerImplementation = PresetViewerImplementationBase & Readonly<{
  render: (context: PresetViewerRenderContext) => ReactNode;
  load?: never;
}>;

export type LazyPresetViewerImplementation = PresetViewerImplementationBase & Readonly<{
  load: () => Promise<{ default: ComponentType<PresetViewerRenderContext> }>;
  render?: never;
}>;

export type PresetViewerImplementation =
  | EagerPresetViewerImplementation
  | LazyPresetViewerImplementation;

/**
 * Versioned contract for a viewer that ships with PuppyOne. Contributions are
 * registered in deterministic order and must not embed format-extension data.
 */
export type EagerPresetViewerContribution = PresetViewerDefinition &
  Omit<EagerPresetViewerImplementation, "id">;

export type LazyPresetViewerContribution = PresetViewerDefinition &
  Omit<LazyPresetViewerImplementation, "id">;

export type PresetViewerContribution = Readonly<
  EagerPresetViewerContribution | LazyPresetViewerContribution
>;

/** @deprecated Prefer the product-semantic PresetViewerContribution name. */
export type EditorViewer = PresetViewerContribution;

/**
 * Stable, format-agnostic contract primitives for viewers that ship with the
 * product. Format extensions and MIME types stay in the canonical format
 * registry; a viewer contribution only declares host capabilities.
 */

export const PRESET_VIEWER_CONTRACT_VERSION = 5 as const;

export const PRESET_VIEWER_CAPABILITIES = ["edit", "preview", "placeholder"] as const;
export type CoreViewerCapability = (typeof PRESET_VIEWER_CAPABILITIES)[number];

export const PRESET_VIEWER_SOURCES = [
  "content",
  "resource",
  "content-and-resource",
  "none",
] as const;
export type PresetViewerSource = (typeof PRESET_VIEWER_SOURCES)[number];

/**
 * `eager` viewers have no heavy format runtime in the initial render path.
 * `lazy` viewers own a dynamic-import/worker boundary for heavy parsers.
 */
export const PRESET_VIEWER_RUNTIMES = ["eager", "lazy"] as const;
export type PresetViewerRuntime = (typeof PRESET_VIEWER_RUNTIMES)[number];

/** Where format-owned code is allowed to execute. This is a fault boundary,
 * unlike `runtime`, which controls only module loading. */
export const PRESET_VIEWER_EXECUTION_ISOLATIONS = [
  "inline",
  "worker-backed",
  "isolated-webcontents",
] as const;
export type PresetViewerExecutionIsolation =
  (typeof PRESET_VIEWER_EXECUTION_ISOLATIONS)[number];

export const PRESET_VIEWER_MEMORY_CLASSES = ["small", "medium", "large"] as const;
export type PresetViewerMemoryClass = (typeof PRESET_VIEWER_MEMORY_CLASSES)[number];

export type PresetViewerResourcePolicy = Readonly<{
  memoryClass: PresetViewerMemoryClass;
  maxCanvasPixels: number;
  maxActiveCanvases: number;
  maxWorkers: number;
}>;

export type PresetViewerRecoveryPolicy = Readonly<{
  maxAutomaticRetries: number;
  supportsSafeMode: boolean;
}>;

/** Stable visual families consumed by Interface Style surface adapters. */
export const VIEWER_SURFACE_FAMILIES = [
  "document",
  "code",
  "grid",
  "canvas",
  "media",
  "embedded",
  "fallback",
] as const;
export type ViewerSurfaceFamily = (typeof VIEWER_SURFACE_FAMILIES)[number];

/** Appearance-relevant traits only; capabilities and runtime stay separate. */
export const VIEWER_SURFACE_TRAITS = [
  "rich-text",
  "monospace",
  "tabular",
  "scrollable",
  "zoomable",
  "paginated",
  "sandboxed",
] as const;
export type ViewerSurfaceTrait = (typeof VIEWER_SURFACE_TRAITS)[number];

/**
 * Whether a Viewer can create its first trustworthy frame while its DOM slot
 * is hidden. Canvas, iframe, media, WebGL and native surfaces generally need a
 * visible layout box before they can report a real first frame.
 */
export const VIEWER_SURFACE_PREPARATIONS = ["hidden-safe", "requires-visible"] as const;
export type ViewerSurfacePreparation = (typeof VIEWER_SURFACE_PREPARATIONS)[number];

/** The observable event that makes a Viewer safe for the Host to commit. */
export const VIEWER_SURFACE_READINESS_SIGNALS = [
  "dom-stable",
  "decoded-resource",
  "frame-paint",
  "first-rendered-frame",
  "media-metadata",
] as const;
export type ViewerSurfaceReadinessSignal =
  (typeof VIEWER_SURFACE_READINESS_SIGNALS)[number];

export type PresetViewerContractVersion = typeof PRESET_VIEWER_CONTRACT_VERSION;

/**
 * Stable, format-agnostic contract primitives for viewers that ship with the
 * product. Format extensions and MIME types stay in the canonical format
 * registry; a viewer contribution only declares host capabilities.
 */

export const PRESET_VIEWER_CONTRACT_VERSION = 3 as const;

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

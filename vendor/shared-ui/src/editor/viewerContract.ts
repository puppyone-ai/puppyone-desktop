/**
 * Stable, format-agnostic contract primitives for viewers that ship with the
 * product. Format extensions and MIME types stay in the canonical format
 * registry; a viewer contribution only declares host capabilities.
 */

export const PRESET_VIEWER_CONTRACT_VERSION = 1 as const;

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

export type PresetViewerContractVersion = typeof PRESET_VIEWER_CONTRACT_VERSION;

export type AgentPickerPlacement = "composer" | "header";
export type AgentPickerIndicator = "chevron" | "none";
export type AgentPickerWidth = "wide" | "medium" | "narrow";

export const agentPickerMaxHeightPixels = 360;

/**
 * Picker widths are presentation roles, not caller-controlled geometry. Keeping
 * them here prevents each Agent/provider integration from inventing a new menu.
 */
export const agentPickerWidthPixels: Readonly<Record<AgentPickerWidth, number>> = Object.freeze({
  wide: 320,
  medium: 248,
  narrow: 148,
});

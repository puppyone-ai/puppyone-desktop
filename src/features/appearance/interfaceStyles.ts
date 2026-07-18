import { INTERFACE_STYLE_MANIFEST } from "./interfaceStyles.generated";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type InterfaceStyle = typeof INTERFACE_STYLE_MANIFEST.styles[number]["id"];
export type InterfaceStyleDefinition = typeof INTERFACE_STYLE_MANIFEST.styles[number];
export type InterfaceStylePalette = InterfaceStyleDefinition["palette"];
export type InterfaceStyleFirstPaint = {
  background: string;
  colorScheme: ResolvedTheme;
};

export const INTERFACE_STYLES = INTERFACE_STYLE_MANIFEST.styles;
export const DEFAULT_INTERFACE_STYLE: InterfaceStyle = INTERFACE_STYLE_MANIFEST.defaultStyle;
export const INTERFACE_STYLE_STORAGE_KEY = INTERFACE_STYLE_MANIFEST.storage.interfaceStyle;
export const THEME_STORAGE_KEY = INTERFACE_STYLE_MANIFEST.storage.themeMode;

export function isInterfaceStyle(value: string | null | undefined): value is InterfaceStyle {
  return typeof value === "string" && INTERFACE_STYLES.some((style) => style.id === value);
}

export function parseInterfaceStyle(value: string | null | undefined): InterfaceStyle {
  return isInterfaceStyle(value) ? value : DEFAULT_INTERFACE_STYLE;
}

export function getInterfaceStyleDefinition(style: InterfaceStyle): InterfaceStyleDefinition {
  return INTERFACE_STYLES.find((definition) => definition.id === style)
    ?? getDefaultInterfaceStyleDefinition();
}

export function getDefaultInterfaceStyleDefinition(): InterfaceStyleDefinition {
  const definition = INTERFACE_STYLES.find((style) => style.id === DEFAULT_INTERFACE_STYLE);
  if (!definition) throw new Error("The default interface style is not registered.");
  return definition;
}

export function resolveActiveThemeMode(
  interfaceStyle: InterfaceStyle,
  themeMode: ThemeMode,
): ThemeMode {
  const palette = getInterfaceStyleDefinition(interfaceStyle).palette;
  if (palette.kind === "fixed") return palette.mode;
  const supportedModes: readonly ThemeMode[] = palette.modes;
  return supportedModes.includes(themeMode) ? themeMode : palette.fallbackMode;
}

export function getInterfaceStyleThemeModes(interfaceStyle: InterfaceStyle): readonly ThemeMode[] {
  const palette = getInterfaceStyleDefinition(interfaceStyle).palette;
  return palette.kind === "adaptive" ? palette.modes : [];
}

export function supportsThemePreset(
  interfaceStyle: InterfaceStyle,
  theme: ResolvedTheme,
): boolean {
  const palette = getInterfaceStyleDefinition(interfaceStyle).palette;
  return palette.kind === "adaptive" && palette.presetControls[theme];
}

export function getInterfaceStyleFirstPaint(
  interfaceStyle: InterfaceStyle,
  theme: ResolvedTheme,
): InterfaceStyleFirstPaint {
  const definition = getInterfaceStyleDefinition(interfaceStyle);
  const firstPaint = definition.firstPaint as Partial<Record<ResolvedTheme, InterfaceStyleFirstPaint>>;
  const paint = firstPaint[theme] ?? firstPaint.light ?? firstPaint.dark;
  if (!paint) throw new Error(`Interface style ${interfaceStyle} has no first-paint palette.`);
  return paint;
}

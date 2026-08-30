import type {
  DesktopThemeColorMode,
  DesktopThemeDefinition,
  DesktopThemeDiagnostic,
  DesktopThemeTarget,
} from "../../types/electron";
import type { DarkThemePreset, LightThemePreset } from "../../preferences";

export type AppearanceSurfaceTarget = DesktopThemeTarget;
export type SubThemeColorMode = DesktopThemeColorMode;
export type SubThemeSource = DesktopThemeDefinition["source"] | "builtin";

export type SubThemeModeVariant = Readonly<{
  compiledCss: Readonly<Partial<Record<AppearanceSurfaceTarget, string>>>;
}>;

export type SubThemeDefinition = Readonly<{
  id: string;
  family: string;
  name: string;
  version: string;
  contractVersion: number;
  author?: string;
  compatibleRootThemeIds: readonly string[];
  targets: readonly AppearanceSurfaceTarget[];
  source: SubThemeSource;
  variants: Readonly<Partial<Record<SubThemeColorMode, SubThemeModeVariant>>>;
  legacyPresets?: Readonly<{
    light?: LightThemePreset;
    dark?: DarkThemePreset;
  }>;
}>;

export function getSubThemeModes(
  subTheme: SubThemeDefinition,
): readonly SubThemeColorMode[] {
  return (Object.keys(subTheme.variants) as SubThemeColorMode[]).filter(
    (mode) => subTheme.variants[mode] !== undefined,
  );
}

export function getSubThemeVariant(
  subTheme: SubThemeDefinition,
  mode: SubThemeColorMode,
): SubThemeModeVariant | null {
  return subTheme.variants[mode] ?? null;
}

export type SubThemeCatalogSnapshot = Readonly<{
  subThemes: readonly SubThemeDefinition[];
  diagnostics: readonly DesktopThemeDiagnostic[];
}>;

export type SubThemeCatalogStatus = "loading" | "ready" | "error";

export type SubThemeCatalogState = Readonly<{
  snapshot: SubThemeCatalogSnapshot;
  status: SubThemeCatalogStatus;
  error: string | null;
}>;

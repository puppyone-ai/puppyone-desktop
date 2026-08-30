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

export type SubThemeDefinition = Readonly<{
  id: string;
  family: string;
  name: string;
  version: string;
  contractVersion: number;
  author?: string;
  compatibleRootThemeIds: readonly string[];
  modes: readonly SubThemeColorMode[];
  targets: readonly AppearanceSurfaceTarget[];
  source: SubThemeSource;
  compiledCss: Readonly<Partial<Record<AppearanceSurfaceTarget, string>>>;
  legacyPresets?: Readonly<{
    light?: LightThemePreset;
    dark?: DarkThemePreset;
  }>;
}>;

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

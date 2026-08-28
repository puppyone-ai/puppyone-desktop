import type {
  DesktopThemeColorMode,
  DesktopThemeDefinition,
  DesktopThemeDiagnostic,
  DesktopThemeTarget,
} from "../../types/electron";

export type ThemeTarget = DesktopThemeTarget;
export type ThemeColorMode = DesktopThemeColorMode;
export type ThemeSource = DesktopThemeDefinition["source"] | "builtin";

export type ThemeDefinition = Readonly<{
  id: string;
  name: string;
  version: string;
  author?: string;
  modes: readonly ThemeColorMode[];
  targets: readonly ThemeTarget[];
  source: ThemeSource;
  compiledCss: Readonly<Partial<Record<ThemeTarget, string>>>;
}>;

export type ThemeCatalogSnapshot = Readonly<{
  themes: readonly ThemeDefinition[];
  diagnostics: readonly DesktopThemeDiagnostic[];
}>;

export type ThemeCatalogStatus = "loading" | "ready" | "error";

export type ThemeCatalogState = Readonly<{
  snapshot: ThemeCatalogSnapshot;
  status: ThemeCatalogStatus;
  error: string | null;
}>;

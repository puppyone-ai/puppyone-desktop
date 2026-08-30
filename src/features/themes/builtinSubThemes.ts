import type { DesktopThemeSnapshot } from "../../types/electron";
import type { InterfaceStyle } from "../appearance/interfaceStyles";
import { GENERATED_BUILTIN_SUB_THEMES } from "./builtinSubThemes.generated";
import type {
  SubThemeCatalogSnapshot,
  SubThemeDefinition,
} from "./themeTypes";
import {
  LEGACY_CUSTOM_CSS_THEME_ID,
  normalizeSubThemeId,
} from "./subThemePreferences";

const COMPLETE_TARGETS = ["application", "markdown", "csv"] as const;

export const BUILTIN_SUB_THEMES: readonly SubThemeDefinition[] = GENERATED_BUILTIN_SUB_THEMES;

export function createSubThemeCatalogSnapshot(external: DesktopThemeSnapshot): SubThemeCatalogSnapshot {
  const subThemes = [...BUILTIN_SUB_THEMES];
  const diagnostics = [...external.diagnostics];
  const knownIds = new Set(subThemes.map((subTheme) => subTheme.id));
  for (const theme of external.themes) {
    const id = normalizeSubThemeId(theme.id);
    if (id === LEGACY_CUSTOM_CSS_THEME_ID) continue;
    if (knownIds.has(id)) {
      diagnostics.push(Object.freeze({
        source: theme.name,
        message: `Sub Theme id conflicts with a built-in variant: ${id}.`,
      }));
      continue;
    }
    knownIds.add(id);
    subThemes.push(Object.freeze({
      ...theme,
      id,
      family: id.split(".")[0] ?? "external",
      contractVersion: theme.contractVersion ?? 1,
      compatibleRootThemeIds: normalizeCompatibleRootThemeIds(theme.compatibleRootThemeIds),
    }));
  }
  return Object.freeze({
    subThemes: Object.freeze(subThemes),
    diagnostics: Object.freeze(diagnostics),
  });
}

export function getCompatibleSubThemes(
  snapshot: SubThemeCatalogSnapshot,
  rootThemeId: InterfaceStyle,
): readonly SubThemeDefinition[] {
  return snapshot.subThemes.filter((subTheme) => (
    subTheme.compatibleRootThemeIds.includes(rootThemeId)
  ));
}

export function isCompleteSubTheme(subTheme: SubThemeDefinition): boolean {
  return COMPLETE_TARGETS.every((target) => subTheme.targets.includes(target));
}

function normalizeCompatibleRootThemeIds(value: readonly string[] | undefined): readonly string[] {
  return Object.freeze(value === undefined ? ["default"] : [...value]);
}

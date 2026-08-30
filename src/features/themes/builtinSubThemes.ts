import type { DesktopThemeSnapshot } from "../../types/electron";
import githubThemeCss from "../../styles/github.css?raw";
import newspaperThemeCss from "../../styles/newspaper.css?raw";
import type { InterfaceStyle } from "../appearance/interfaceStyles";
import type {
  AppearanceSurfaceTarget,
  SubThemeCatalogSnapshot,
  SubThemeDefinition,
} from "./themeTypes";
import {
  LEGACY_CUSTOM_CSS_THEME_ID,
  normalizeSubThemeId,
} from "./subThemePreferences";

const COMPLETE_TARGETS = ["application", "markdown", "csv"] as const;

export const BUILTIN_SUB_THEMES: readonly SubThemeDefinition[] = Object.freeze([
  defineBuiltin({
    id: "default.neutral",
    family: "default",
    name: "Neutral",
    compatibleRootThemeIds: ["default"],
    targets: COMPLETE_TARGETS,
    legacyPresets: { light: "neutral", dark: "default" },
  }),
  defineBuiltin({
    id: "default.warm",
    family: "default",
    name: "Warm",
    compatibleRootThemeIds: ["default"],
    targets: COMPLETE_TARGETS,
    legacyPresets: { light: "warm", dark: "warm" },
  }),
  defineBuiltin({
    id: "default.graphite",
    family: "default",
    name: "Graphite",
    compatibleRootThemeIds: ["default"],
    targets: COMPLETE_TARGETS,
    legacyPresets: { light: "graphite", dark: "graphite" },
  }),
  defineBuiltin({
    id: "default.github",
    family: "default",
    name: "GitHub",
    compatibleRootThemeIds: ["default"],
    targets: COMPLETE_TARGETS,
    css: githubThemeCss,
  }),
  defineBuiltin({
    id: "default.newspaper",
    family: "default",
    name: "Newspaper",
    compatibleRootThemeIds: ["default"],
    targets: COMPLETE_TARGETS,
    css: newspaperThemeCss,
  }),
  defineBuiltin({
    id: "windows-xp.luna-blue",
    family: "windows-xp",
    name: "Luna Blue",
    compatibleRootThemeIds: ["windows-xp"],
    modes: ["light"],
    targets: ["markdown", "csv"],
  }),
]);

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

function defineBuiltin({
  id,
  family,
  name,
  compatibleRootThemeIds,
  targets,
  modes = ["light", "dark"],
  css,
  legacyPresets,
}: {
  id: string;
  family: string;
  name: string;
  compatibleRootThemeIds: readonly InterfaceStyle[];
  targets: readonly AppearanceSurfaceTarget[];
  modes?: SubThemeDefinition["modes"];
  css?: string;
  legacyPresets?: SubThemeDefinition["legacyPresets"];
}): SubThemeDefinition {
  return Object.freeze({
    id,
    family,
    name,
    version: "1.0.0",
    contractVersion: 1,
    compatibleRootThemeIds: Object.freeze([...compatibleRootThemeIds]),
    modes: Object.freeze([...modes]),
    targets: Object.freeze([...targets]),
    source: "builtin",
    compiledCss: Object.freeze(css ? { application: css } : {}),
    ...(legacyPresets ? { legacyPresets: Object.freeze({ ...legacyPresets }) } : {}),
  });
}

function normalizeCompatibleRootThemeIds(value: readonly string[] | undefined): readonly string[] {
  return Object.freeze(value === undefined ? ["default"] : [...value]);
}

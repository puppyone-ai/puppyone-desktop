import type { DesktopThemeSnapshot } from "../../types/electron";
import type { ThemeCatalogSnapshot, ThemeDefinition } from "./themeTypes";

export const BUILTIN_SURFACE_THEMES: readonly ThemeDefinition[] = Object.freeze([
  defineBuiltin({
    id: "default",
    name: "Default",
    targets: ["application", "markdown", "csv"],
  }),
  defineBuiltin({
    id: "builtin.markdown.newsprint",
    name: "Newsprint",
    targets: ["markdown"],
  }),
  defineBuiltin({
    id: "builtin.markdown.focus",
    name: "Focus",
    targets: ["markdown"],
  }),
  defineBuiltin({
    id: "builtin.csv.spreadsheet",
    name: "Spreadsheet",
    targets: ["csv"],
  }),
  defineBuiltin({
    id: "builtin.csv.ledger",
    name: "Ledger",
    targets: ["csv"],
  }),
]);

export function createThemeCatalogSnapshot(external: DesktopThemeSnapshot): ThemeCatalogSnapshot {
  const themes = [...BUILTIN_SURFACE_THEMES];
  const diagnostics = [...external.diagnostics];
  const knownIds = new Set(themes.map((theme) => theme.id));
  for (const theme of external.themes) {
    if (knownIds.has(theme.id)) {
      diagnostics.push(Object.freeze({
        source: theme.name,
        message: `Theme id conflicts with a built-in theme: ${theme.id}.`,
      }));
      continue;
    }
    knownIds.add(theme.id);
    themes.push(Object.freeze({ ...theme }));
  }
  return Object.freeze({
    themes: Object.freeze(themes),
    diagnostics: Object.freeze(diagnostics),
  });
}

export function getThemesForTarget(
  snapshot: ThemeCatalogSnapshot,
  target: ThemeDefinition["targets"][number],
): readonly ThemeDefinition[] {
  return snapshot.themes.filter((theme) => theme.targets.includes(target));
}

function defineBuiltin({
  id,
  name,
  targets,
}: {
  id: string;
  name: string;
  targets: ThemeDefinition["targets"];
}): ThemeDefinition {
  return Object.freeze({
    id,
    name,
    version: "1.0.0",
    modes: Object.freeze(["light", "dark"] as const),
    targets: Object.freeze([...targets]),
    source: "builtin",
    compiledCss: Object.freeze({}),
  });
}

import { createPortal } from "react-dom";
import type { CSSProperties, ReactElement } from "react";
import type { ThemeCatalogSnapshot } from "./themeTypes";
import {
  CUSTOM_CSS_THEME_ID,
  type SurfaceThemePreferences,
  type SurfaceThemeSelection,
} from "./themePreferences";
import {
  resolveMarkdownPresentationStyle,
  type MarkdownPresentationSettings,
} from "../markdown/markdownPresentation";

export function ThemeStyleHost({
  preferences,
  selection,
  snapshot,
  markdownPresentation,
}: {
  preferences: SurfaceThemePreferences;
  selection: SurfaceThemeSelection;
  snapshot: ThemeCatalogSnapshot;
  markdownPresentation: MarkdownPresentationSettings;
}) {
  if (typeof document === "undefined") return null;
  const styles: ReactElement[] = snapshot.themes.flatMap((theme) => (
    theme.targets.flatMap((target) => {
      if (theme.id === CUSTOM_CSS_THEME_ID || selection[target] !== theme.id) return [];
      const css = theme.compiledCss[target];
      if (!css) return [];
      return (
        <style
          key={`${theme.id}:${target}`}
          data-po-theme-style={`${theme.id}:${target}`}
          data-po-theme-id={theme.id}
          data-po-theme-target={target}
          data-po-theme-layer="theme"
        >
          {css}
        </style>
      );
    })
  ));

  const editorCss = createMarkdownPresentationCss(markdownPresentation);
  if (editorCss) {
    styles.push(
      <style
        key="markdown-presentation"
        data-po-theme-style="markdown-presentation"
        data-po-theme-target="markdown"
        data-po-theme-layer="editor"
      >
        {editorCss}
      </style>,
    );
  }

  const customTheme = snapshot.themes.find((theme) => theme.id === CUSTOM_CSS_THEME_ID);
  if (customTheme) {
    for (const target of customTheme.targets) {
      if (!preferences.customCss[target]) continue;
      const css = customTheme.compiledCss[target];
      if (!css) continue;
      styles.push(
        <style
          key={`${CUSTOM_CSS_THEME_ID}:${target}`}
          data-po-theme-style={`${CUSTOM_CSS_THEME_ID}:${target}`}
          data-po-theme-id={CUSTOM_CSS_THEME_ID}
          data-po-theme-target={target}
          data-po-theme-layer="custom-css"
        >
          {css}
        </style>,
      );
    }
  }
  return createPortal(styles, document.head);
}

function createMarkdownPresentationCss(settings: MarkdownPresentationSettings): string {
  const declarations = Object.entries(resolveMarkdownPresentationStyle(settings) as CSSProperties)
    .filter((entry): entry is [string, string | number] => (
      typeof entry[1] === "string" || typeof entry[1] === "number"
    ))
    .map(([property, value]) => `  ${property}: ${String(value)};`);
  if (declarations.length === 0) return "";
  return [
    '[data-po-theme-surface="markdown"][data-po-theme-id] {',
    ...declarations,
    "}",
  ].join("\n");
}

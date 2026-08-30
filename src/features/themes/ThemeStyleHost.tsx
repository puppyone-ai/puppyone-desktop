import { createPortal } from "react-dom";
import type { CSSProperties, ReactElement } from "react";
import type { ThemeCatalogSnapshot } from "./themeTypes";
import { LEGACY_CUSTOM_CSS_THEME_ID, type SurfaceThemeSelection } from "./themePreferences";
import {
  resolveMarkdownPresentationStyle,
  type MarkdownPresentationSettings,
} from "../markdown/markdownPresentation";

export function ThemeStyleHost({
  selection,
  snapshot,
  markdownPresentation,
}: {
  selection: SurfaceThemeSelection;
  snapshot: ThemeCatalogSnapshot;
  markdownPresentation: MarkdownPresentationSettings;
}) {
  if (typeof document === "undefined") return null;
  const styles: ReactElement[] = snapshot.themes.flatMap((theme) => (
    theme.targets.flatMap((target) => {
      if (theme.id === LEGACY_CUSTOM_CSS_THEME_ID || selection[target] !== theme.id) return [];
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

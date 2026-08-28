import { createPortal } from "react-dom";
import type { ThemeCatalogSnapshot } from "./themeTypes";
import type { SurfaceThemeSelection } from "./themePreferences";

export function ThemeStyleHost({
  preferences,
  snapshot,
}: {
  preferences: SurfaceThemeSelection;
  snapshot: ThemeCatalogSnapshot;
}) {
  if (typeof document === "undefined") return null;
  const styles = snapshot.themes.flatMap((theme) => (
    theme.targets.flatMap((target) => {
      if (preferences[target] !== theme.id) return [];
      const css = theme.compiledCss[target];
      if (!css) return [];
      return (
        <style
          key={`${theme.id}:${target}`}
          data-po-theme-style={`${theme.id}:${target}`}
          data-po-theme-id={theme.id}
          data-po-theme-target={target}
        >
          {css}
        </style>
      );
    })
  ));
  return createPortal(styles, document.head);
}

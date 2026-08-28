import { createPortal } from "react-dom";
import type { ThemeCatalogSnapshot } from "./themeTypes";

export function ThemeStyleHost({ snapshot }: { snapshot: ThemeCatalogSnapshot }) {
  if (typeof document === "undefined") return null;
  const styles = snapshot.themes.flatMap((theme) => (
    theme.targets.flatMap((target) => {
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

(() => {
  try {
    const manifest = window.__PUPPYONE_INTERFACE_STYLE_MANIFEST__;
    if (!manifest || !Array.isArray(manifest.styles)) return;
    const styles = new Map(manifest.styles.map((style) => [style.id, style]));
    const defaultStyle = styles.get(manifest.defaultStyle);
    if (!defaultStyle) return;

    const storedTheme = window.localStorage.getItem(manifest.storage.themeMode);
    const storedInterfaceStyle = window.localStorage.getItem(manifest.storage.interfaceStyle);
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const style = styles.get(storedInterfaceStyle) ?? defaultStyle;
    const palette = style.palette;
    const activeMode = palette.kind === "fixed"
      ? palette.mode
      : palette.modes.includes(storedTheme) ? storedTheme : palette.fallbackMode;
    const resolvedTheme = activeMode === "system"
      ? systemDark ? "dark" : "light"
      : activeMode;
    const firstPaint = style.firstPaint[resolvedTheme]
      ?? style.firstPaint.light
      ?? style.firstPaint.dark;

    document.documentElement.dataset.interfaceStyle = style.id;
    document.documentElement.dataset.initialTheme = resolvedTheme;
    if (firstPaint) {
      document.documentElement.style.setProperty("--initial-shell-background", firstPaint.background);
      document.documentElement.style.setProperty("--initial-shell-color-scheme", firstPaint.colorScheme);
    }
  } catch {
    // Keep the static first-paint background when storage is unavailable.
  }
})();

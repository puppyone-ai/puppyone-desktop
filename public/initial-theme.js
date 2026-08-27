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
    const presetDefinition = style.presetFirstPaint?.[resolvedTheme];
    const presetStorageKey = resolvedTheme === "light"
      ? manifest.storage.lightThemePreset
      : manifest.storage.darkThemePreset;
    const legacyPreset = resolvedTheme === "light" && manifest.storage.legacyThemePreset
      ? window.localStorage.getItem(manifest.storage.legacyThemePreset)
      : null;
    const storedPreset = presetStorageKey
      ? window.localStorage.getItem(presetStorageKey) ?? legacyPreset
      : null;
    const resolvedPreset = storedPreset && Object.hasOwn(presetDefinition?.values ?? {}, storedPreset)
      ? storedPreset
      : presetDefinition?.defaultPreset;
    const firstPaint = presetDefinition?.values?.[resolvedPreset]
      ?? style.firstPaint[resolvedTheme]
      ?? style.firstPaint.light
      ?? style.firstPaint.dark;
    document.documentElement.dataset.interfaceStyle = style.id;
    document.documentElement.dataset.interfaceStyleFamily = style.profile?.family ?? style.id;
    document.documentElement.dataset.interfaceStyleVariant = style.profile?.variant ?? "product";
    document.documentElement.dataset.interfaceStylePalette = style.profile?.palette ?? "adaptive";
    document.documentElement.dataset.initialTheme = resolvedTheme;
    if (resolvedPreset) document.documentElement.dataset.initialThemePreset = resolvedPreset;
    if (firstPaint) {
      document.documentElement.style.setProperty("--initial-shell-background", firstPaint.background);
      document.documentElement.style.setProperty("--initial-shell-color-scheme", firstPaint.colorScheme);
      window.puppyoneDesktop?.setWindowBackground?.({ background: firstPaint.background });
    }
  } catch {
    // Keep the static first-paint background when storage is unavailable.
  }
})();

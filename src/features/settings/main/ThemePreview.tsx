import type { DarkThemePreset, LightThemePreset, ThemeMode } from "../../../preferences";

export function ThemePreview({
  mode,
  lightThemePreset,
  darkThemePreset,
}: {
  mode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
}) {
  return (
    <span className={`desktop-theme-preview ${mode === "system" ? "system" : ""}`} aria-hidden="true">
      {mode === "system" ? (
        <>
          <ThemePreviewSurface mode="light" lightThemePreset={lightThemePreset} darkThemePreset={darkThemePreset} />
          <ThemePreviewSurface mode="dark" lightThemePreset={lightThemePreset} darkThemePreset={darkThemePreset} />
        </>
      ) : (
        <ThemePreviewSurface mode={mode} lightThemePreset={lightThemePreset} darkThemePreset={darkThemePreset} />
      )}
    </span>
  );
}

function ThemePreviewSurface({
  mode,
  lightThemePreset,
  darkThemePreset,
}: {
  mode: Exclude<ThemeMode, "system">;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
}) {
  return (
    <span
      className={`desktop-theme-preview-surface ${mode === "dark" ? "dark" : ""}`}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
    >
      <i className="desktop-theme-preview-sidebar"><b /><b /><b /></i>
      <i className="desktop-theme-preview-panel"><b className="accent" /><b /><b /></i>
    </span>
  );
}

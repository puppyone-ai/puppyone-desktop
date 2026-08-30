import type { DarkThemePreset, LightThemePreset, ThemeMode } from "../../../preferences";

export function ThemePreview({
  mode,
  subThemeId,
  lightThemePreset,
  darkThemePreset,
}: {
  mode: ThemeMode;
  subThemeId: string;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
}) {
  return (
    <span className={`desktop-theme-preview ${mode === "system" ? "system" : ""}`} aria-hidden="true">
      {mode === "system" ? (
        <>
          <ThemePreviewSurface mode="light" subThemeId={subThemeId} lightThemePreset={lightThemePreset} darkThemePreset={darkThemePreset} />
          <ThemePreviewSurface mode="dark" subThemeId={subThemeId} lightThemePreset={lightThemePreset} darkThemePreset={darkThemePreset} />
        </>
      ) : (
        <ThemePreviewSurface mode={mode} subThemeId={subThemeId} lightThemePreset={lightThemePreset} darkThemePreset={darkThemePreset} />
      )}
    </span>
  );
}

function ThemePreviewSurface({
  mode,
  subThemeId,
  lightThemePreset,
  darkThemePreset,
}: {
  mode: Exclude<ThemeMode, "system">;
  subThemeId: string;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
}) {
  return (
    <span
      className={`desktop-theme-preview-surface ${mode === "dark" ? "dark" : ""}`}
      data-po-appearance-root="true"
      data-sub-theme-id={subThemeId}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
    >
      <i className="desktop-theme-preview-sidebar"><b /><b /><b /></i>
      <i className="desktop-theme-preview-panel"><b className="accent" /><b /><b /></i>
    </span>
  );
}

import type { DarkThemePreset, DiffMarkers, LightThemePreset, TextSize, ThemeMode } from "../../preferences";

const puppyoneLogoUrl = new URL("../../../public/puppyone-logo.svg", import.meta.url).href;

type RestoringWorkspaceScreenProps = {
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  textSize: TextSize;
  pointerCursors: boolean;
  diffMarkers: DiffMarkers;
  resolvedTheme: "light" | "dark";
};

export function RestoringWorkspaceScreen({
  themeMode,
  lightThemePreset,
  darkThemePreset,
  textSize,
  pointerCursors,
  diffMarkers,
  resolvedTheme,
}: RestoringWorkspaceScreenProps) {
  return (
    <main
      className={`onboarding-shell ${resolvedTheme === "dark" ? "dark" : ""}`}
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
    >
      <div className="onboarding-titlebar" aria-hidden="true" />
      <section className="restoring-workspace-status" aria-label="Opening last project">
        <img src={puppyoneLogoUrl} alt="" className="restoring-workspace-logo" />
        <span>Opening last project...</span>
      </section>
    </main>
  );
}

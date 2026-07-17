import type { DarkThemePreset, DiffMarkers, LightThemePreset, TextSize, ThemeMode } from "../../preferences";
import {
  createTypographyRootProps,
  type ResolvedTypography,
} from "../typography";
import { useLocalization } from "@puppyone/localization";

const puppyoneLogoUrl = new URL("../../../public/puppyone-logo.svg", import.meta.url).href;

type RestoringWorkspaceScreenProps = {
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  textSize: TextSize;
  typography: ResolvedTypography;
  pointerCursors: boolean;
  diffMarkers: DiffMarkers;
  resolvedTheme: "light" | "dark";
};

export function RestoringWorkspaceScreen({
  themeMode,
  lightThemePreset,
  darkThemePreset,
  textSize,
  typography,
  pointerCursors,
  diffMarkers,
  resolvedTheme,
}: RestoringWorkspaceScreenProps) {
  const { t } = useLocalization();
  return (
    <main
      className={`onboarding-shell ${resolvedTheme === "dark" ? "dark" : ""}`}
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
      {...createTypographyRootProps(typography)}
    >
      <div className="onboarding-titlebar" aria-hidden="true" />
      <section className="restoring-workspace-status" aria-label={t("workspace.restoring.ariaLabel")}>
        <img src={puppyoneLogoUrl} alt="" className="restoring-workspace-logo" />
        <span>{t("workspace.restoring.message")}</span>
      </section>
    </main>
  );
}

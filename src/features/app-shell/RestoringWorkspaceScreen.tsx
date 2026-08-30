import type { DarkThemePreset, DiffMarkers, LightThemePreset, TextSize, ThemeMode } from "../../preferences";
import {
  createTypographyRootProps,
  type ResolvedTypography,
} from "../typography";
import { useLocalization } from "@puppyone/localization";
import { PulseGrid } from "../../components/loading";
import { DesktopWindowDragRegion } from "../../components/DesktopWindowChrome";

type RestoringWorkspaceScreenProps = {
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  textSize: TextSize;
  typography: ResolvedTypography;
  pointerCursors: boolean;
  diffMarkers: DiffMarkers;
  resolvedTheme: "light" | "dark";
  subThemeId: string;
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
  subThemeId,
}: RestoringWorkspaceScreenProps) {
  const { t } = useLocalization();
  return (
    <main
      className={`onboarding-shell ${resolvedTheme === "dark" ? "dark" : ""}`}
      data-po-appearance-root="true"
      data-sub-theme-id={subThemeId}
      data-po-scrollbar="content"
      data-theme-mode={themeMode}
      data-light-theme-preset={lightThemePreset}
      data-dark-theme-preset={darkThemePreset}
      data-text-size={textSize}
      data-interface-text-size={textSize}
      data-content-text-size={textSize}
      data-terminal-text-size={textSize}
      data-pointer-cursors={pointerCursors ? "true" : "false"}
      data-diff-markers={diffMarkers}
      {...createTypographyRootProps(typography)}
    >
      <DesktopWindowDragRegion className="onboarding-titlebar" />
      <PulseGrid ariaLabel={t("workspace.restoring.ariaLabel")} size="sm" tone="neutral" />
    </main>
  );
}

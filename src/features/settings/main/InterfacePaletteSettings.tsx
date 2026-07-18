import { type CSSProperties } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import {
  getInterfaceStyleDefinition,
  type InterfaceStyle,
  type ThemeMode,
} from "../../appearance/interfaceStyles";
import {
  DARK_THEME_PRESETS,
  LIGHT_THEME_PRESETS,
  type DarkThemePreset,
  type LightThemePreset,
} from "../../../preferences";
import { ThemePreview } from "./ThemePreview";

type InterfacePaletteSettingsProps = {
  interfaceStyle: InterfaceStyle;
  themeMode: ThemeMode;
  lightThemePreset: LightThemePreset;
  darkThemePreset: DarkThemePreset;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLightThemePresetChange: (preset: LightThemePreset) => void;
  onDarkThemePresetChange: (preset: DarkThemePreset) => void;
};

const THEME_MODE_OPTIONS = {
  system: { labelId: "settings.appearance.theme.system", icon: Monitor },
  light: { labelId: "settings.appearance.theme.light", icon: Sun },
  dark: { labelId: "settings.appearance.theme.dark", icon: Moon },
} as const;

export function InterfacePaletteSettings({
  interfaceStyle,
  themeMode,
  lightThemePreset,
  darkThemePreset,
  onThemeModeChange,
  onLightThemePresetChange,
  onDarkThemePresetChange,
}: InterfacePaletteSettingsProps) {
  const { t } = useLocalization();
  const palette = getInterfaceStyleDefinition(interfaceStyle).palette;
  if (palette.kind !== "adaptive") return null;

  return (
    <>
      <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row desktop-theme-mode-row">
        <span>{t("settings.appearance.theme.title")}</span>
        <div className="desktop-theme-choice-list" aria-label={t("settings.appearance.theme.ariaLabel")}>
          {palette.modes.map((mode) => {
            const option = THEME_MODE_OPTIONS[mode];
            const Icon = option.icon;
            return (
              <button
                className={`desktop-theme-choice ${themeMode === mode ? "active" : ""}`}
                type="button"
                key={mode}
                aria-pressed={themeMode === mode}
                onClick={() => onThemeModeChange(mode)}
              >
                <ThemePreview
                  mode={mode}
                  lightThemePreset={lightThemePreset}
                  darkThemePreset={darkThemePreset}
                />
                <span className="desktop-theme-choice-label">
                  <Icon size={13} />
                  <span>{t(option.labelId)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {palette.presetControls.light && (
        <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
          <span>{t("settings.appearance.lightTheme.title")}</span>
          <div className="desktop-theme-segment desktop-theme-preset-list" aria-label={t("settings.appearance.lightTheme.ariaLabel")}>
            {LIGHT_THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={lightThemePreset === preset.id ? "active" : ""}
                type="button"
                title={t(`settings.appearance.lightTheme.${preset.id}.description`)}
                aria-pressed={lightThemePreset === preset.id}
                onClick={() => onLightThemePresetChange(preset.id)}
              >
                <span className="desktop-theme-preset-swatches" aria-hidden="true">
                  {preset.swatches.map((swatch) => (
                    <i key={swatch} style={{ "--settings-theme-swatch": swatch } as CSSProperties} />
                  ))}
                </span>
                <span>{t(`settings.appearance.lightTheme.${preset.id}.label`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {palette.presetControls.dark && (
        <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
          <span>{t("settings.appearance.darkTheme.title")}</span>
          <div className="desktop-theme-segment desktop-theme-preset-list" aria-label={t("settings.appearance.darkTheme.ariaLabel")}>
            {DARK_THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={darkThemePreset === preset.id ? "active" : ""}
                type="button"
                title={t(`settings.appearance.darkTheme.${preset.id}.description`)}
                aria-pressed={darkThemePreset === preset.id}
                onClick={() => onDarkThemePresetChange(preset.id)}
              >
                <span className="desktop-theme-preset-swatches" aria-hidden="true">
                  {preset.swatches.map((swatch) => (
                    <i key={swatch} style={{ "--settings-theme-swatch": swatch } as CSSProperties} />
                  ))}
                </span>
                <span>{t(`settings.appearance.darkTheme.${preset.id}.label`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

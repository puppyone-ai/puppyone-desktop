import { useLocalization } from "@puppyone/localization";
import type { InterfaceStyle } from "../../../preferences";

type InterfaceStyleSettingProps = {
  value: InterfaceStyle;
  onChange: (style: InterfaceStyle) => void;
};

export function InterfaceStyleSetting({ value, onChange }: InterfaceStyleSettingProps) {
  const { t } = useLocalization();

  return (
    <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
      <span>{t("settings.appearance.interfaceStyle.title")}</span>
      <div
        className="desktop-theme-segment desktop-interface-style-segment"
        aria-label={t("settings.appearance.interfaceStyle.ariaLabel")}
      >
        <button
          className={value === "default" ? "active" : ""}
          type="button"
          aria-pressed={value === "default"}
          onClick={() => onChange("default")}
        >
          {t("settings.appearance.interfaceStyle.default")}
        </button>
        <button
          className={value === "windows-xp" ? "active" : ""}
          type="button"
          aria-pressed={value === "windows-xp"}
          onClick={() => onChange("windows-xp")}
        >
          {t("settings.appearance.interfaceStyle.windowsXp")}
        </button>
        <button
          className={value === "macos-tiger" ? "active" : ""}
          type="button"
          aria-pressed={value === "macos-tiger"}
          onClick={() => onChange("macos-tiger")}
        >
          {t("settings.appearance.interfaceStyle.macosTiger")}
        </button>
      </div>
    </div>
  );
}

import { useLocalization } from "@puppyone/localization";
import {
  INTERFACE_STYLES,
  type InterfaceStyle,
} from "../../appearance/interfaceStyles";

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
        {INTERFACE_STYLES.map((style) => (
          <button
            className={value === style.id ? "active" : ""}
            type="button"
            key={style.id}
            aria-pressed={value === style.id}
            onClick={() => onChange(style.id)}
          >
            {t(style.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

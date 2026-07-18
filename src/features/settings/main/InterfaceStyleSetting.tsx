import { useLocalization } from "@puppyone/localization";
import type { InterfaceStyle } from "../../../preferences";

type InterfaceStyleSettingProps = {
  value: InterfaceStyle;
  onChange: (style: InterfaceStyle) => void;
};

export function InterfaceStyleSetting({ value, onChange }: InterfaceStyleSettingProps) {
  const { t } = useLocalization();

  return (
    <div className="desktop-settings-row desktop-settings-row-control">
      <span className="desktop-settings-label-stack">
        <strong>{t("settings.appearance.interfaceStyle.title")}</strong>
        <small>{t("settings.appearance.interfaceStyle.detail")}</small>
      </span>
      <label className="desktop-settings-switch">
        <input
          type="checkbox"
          aria-label={t("settings.appearance.interfaceStyle.title")}
          checked={value === "windows-xp"}
          onChange={(event) => onChange(event.target.checked ? "windows-xp" : "default")}
        />
        <span aria-hidden="true" />
      </label>
    </div>
  );
}

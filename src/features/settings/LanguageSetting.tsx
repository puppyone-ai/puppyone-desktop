import { useState } from "react";
import {
  isSelectableAppLanguagePreference,
  resolveSystemLocale,
  useLocalization,
  type AppLanguagePreference,
} from "@puppyone/localization";

export function LanguageSettingRow() {
  const {
    preference,
    localeDescriptors,
    systemLanguages,
    status,
    t,
    setLanguagePreference,
  } = useLocalization();
  const [changeFailed, setChangeFailed] = useState(false);
  const changing = status === "changing";
  const systemLocale = resolveSystemLocale(systemLanguages);
  const systemLanguage = localeDescriptors.find((descriptor) => descriptor.locale === systemLocale)?.label
    ?? systemLocale;

  const changeLanguage = async (nextPreference: AppLanguagePreference) => {
    setChangeFailed(false);
    try {
      await setLanguagePreference(nextPreference);
    } catch {
      setChangeFailed(true);
    }
  };

  return (
    <label className="desktop-settings-row desktop-settings-row-control desktop-language-setting-row">
      <span>{t("settings.language.selectorLabel")}</span>
      <div className="desktop-language-setting-control">
        <select
          className="desktop-settings-select desktop-language-setting-select"
          aria-label={t("settings.language.selectorLabel")}
          value={preference}
          disabled={changing}
          onChange={(event) => {
            const nextPreference = event.target.value;
            if (isSelectableAppLanguagePreference(nextPreference)) {
              void changeLanguage(nextPreference);
            }
          }}
        >
          <option value="system">
            {t("settings.language.system", { language: systemLanguage })}
          </option>
          {localeDescriptors.filter((descriptor) => descriptor.productionReady).map((descriptor) => (
            <option
              key={descriptor.locale}
              value={descriptor.locale}
              lang={descriptor.locale}
              dir={descriptor.direction}
            >
              {descriptor.label}
            </option>
          ))}
        </select>
        {changing && (
          <small className="desktop-language-setting-status" role="status">
            {t("settings.language.changing")}
          </small>
        )}
        {changeFailed && (
          <small className="desktop-language-setting-error" role="alert">
            {t("settings.language.changeFailed")}
          </small>
        )}
      </div>
    </label>
  );
}

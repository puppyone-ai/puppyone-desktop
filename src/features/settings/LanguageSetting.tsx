import { useState } from "react";
import {
  isSelectableAppLanguagePreference,
  useLocalization,
  type AppLanguagePreference,
} from "@puppyone/localization";

export function LanguageSetting() {
  const {
    preference,
    locale,
    localeDescriptors,
    status,
    t,
    setLanguagePreference,
  } = useLocalization();
  const [changeFailed, setChangeFailed] = useState(false);
  const changing = status === "changing";
  const resolvedLanguage = localeDescriptors.find((descriptor) => descriptor.locale === locale)?.label
    ?? locale;

  const changeLanguage = async (nextPreference: AppLanguagePreference) => {
    setChangeFailed(false);
    try {
      await setLanguagePreference(nextPreference);
    } catch {
      setChangeFailed(true);
    }
  };

  return (
    <div className="desktop-settings-row desktop-settings-row-control desktop-language-setting-row">
      <span className="desktop-settings-label-stack">
        <strong>{t("settings.language.title")}</strong>
        <small>{t("settings.language.description")}</small>
      </span>
      <span className="desktop-language-setting-control">
        <select
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
            {t("settings.language.system", { language: resolvedLanguage })}
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
      </span>
    </div>
  );
}

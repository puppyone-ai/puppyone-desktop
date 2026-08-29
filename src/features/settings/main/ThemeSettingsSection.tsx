import { useEffect, useState } from "react";
import { useLocalization } from "@puppyone/localization";
import { getThemePacks } from "../../themes/builtinSurfaceThemes";
import { THEME_MARKETPLACE_URL } from "../../themes/themeMarketplace";
import type { ThemeCatalogController } from "../../themes/useThemeCatalog";
import type { SurfaceThemePreferences } from "../../themes/themePreferences";
import type { ThemeTarget } from "../../themes/themeTypes";

export function ThemeSettingsSection({
  catalog,
  preferences,
  onThemePackChange,
  onCustomCssEnabledChange,
}: {
  catalog: ThemeCatalogController;
  preferences: SurfaceThemePreferences;
  onThemePackChange: (themeId: string) => void;
  onCustomCssEnabledChange: (target: ThemeTarget, enabled: boolean) => void;
}) {
  const { t } = useLocalization();
  const onReload = () => void catalog.reload();
  const onOpenDirectory = () => void catalog.openDirectory();
  const onAddTheme = () => {
    if (!THEME_MARKETPLACE_URL) return;
    void window.puppyoneDesktop?.openExternalUrl(THEME_MARKETPLACE_URL);
  };
  const packs = getThemePacks(catalog.snapshot);
  const selectedPackExists = packs.some((theme) => theme.id === preferences.pack);

  return (
    <div className="desktop-theme-settings-section">
      <div className="desktop-settings-subsection-title">
        {t("settings.appearance.themes.title")}
      </div>
      <p className="desktop-theme-settings-detail">{t("settings.appearance.themes.detail")}</p>
      <div className="desktop-settings-list">
        <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
          <label htmlFor="desktop-theme-pack-select">{t("settings.appearance.themes.pack")}</label>
          <div className="desktop-theme-pack-controls">
            <select
              id="desktop-theme-pack-select"
              className="desktop-settings-select"
              value={preferences.pack}
              onChange={(event) => onThemePackChange(event.currentTarget.value)}
            >
              {!selectedPackExists && (
                <option value={preferences.pack}>{t("settings.appearance.themes.missing", { id: preferences.pack })}</option>
              )}
              {packs.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </select>
            <button
              className="desktop-settings-action"
              type="button"
              disabled={!THEME_MARKETPLACE_URL}
              aria-describedby={!THEME_MARKETPLACE_URL ? "desktop-theme-add-status" : undefined}
              title={!THEME_MARKETPLACE_URL
                ? t("settings.appearance.themes.addUnavailable")
                : undefined}
              onClick={onAddTheme}
            >
              {t("settings.appearance.themes.add")}
            </button>
            {!THEME_MARKETPLACE_URL && (
              <span id="desktop-theme-add-status" className="desktop-settings-visually-hidden">
                {t("settings.appearance.themes.addUnavailable")}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="desktop-theme-settings-actions">
        <button className="desktop-settings-action" type="button" onClick={onOpenDirectory}>
          {t("settings.appearance.themes.openFolder")}
        </button>
        <button className="desktop-settings-action" type="button" disabled={catalog.status === "loading"} onClick={onReload}>
          {t("settings.appearance.themes.reload")}
        </button>
      </div>
      <details className="desktop-theme-settings-advanced">
        <summary>{t("settings.appearance.themes.advanced")}</summary>
        <CustomCssEditor
          catalog={catalog}
          preferences={preferences}
          onCustomCssEnabledChange={onCustomCssEnabledChange}
        />
        {catalog.error && <p className="desktop-theme-settings-error" role="alert">{catalog.error}</p>}
        {catalog.snapshot.diagnostics.length > 0 && (
          <ul className="desktop-theme-settings-diagnostics" aria-label={t("settings.appearance.themes.diagnostics")}>
            {catalog.snapshot.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.source}:${index}`}>
                <strong>{diagnostic.source}</strong>: {diagnostic.message}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function CustomCssEditor({
  catalog,
  preferences,
  onCustomCssEnabledChange,
}: {
  catalog: ThemeCatalogController;
  preferences: SurfaceThemePreferences;
  onCustomCssEnabledChange: (target: ThemeTarget, enabled: boolean) => void;
}) {
  const { t } = useLocalization();
  const [target, setTarget] = useState<ThemeTarget>("markdown");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { readCustomCss, saveCustomCss } = catalog;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaved(false);
    void readCustomCss(target)
      .then((css) => {
        if (!cancelled) setSource(css);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readCustomCss, target]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const didSave = await saveCustomCss(target, source);
    setSaving(false);
    if (!didSave) return;
    onCustomCssEnabledChange(target, true);
    setSaved(true);
  };

  return (
    <div className="desktop-theme-custom-css">
      <div className="desktop-settings-subsection-title">
        {t("settings.appearance.themes.customCss.title")}
      </div>
      <p className="desktop-theme-settings-detail">
        {t("settings.appearance.themes.customCss.detail")}
      </p>
      <label className="desktop-settings-row desktop-settings-row-control">
        <span>{t("settings.appearance.themes.customCss.target")}</span>
        <select
          className="desktop-settings-select"
          value={target}
          onChange={(event) => setTarget(event.currentTarget.value as ThemeTarget)}
        >
          <option value="application">{t("settings.appearance.themes.application")}</option>
          <option value="markdown">{t("settings.appearance.themes.markdown")}</option>
          <option value="csv">{t("settings.appearance.themes.csv")}</option>
        </select>
      </label>
      <label className="desktop-settings-row desktop-settings-row-control">
        <span>{t("settings.appearance.themes.customCss.enabled")}</span>
        <span className="desktop-settings-switch">
          <input
            type="checkbox"
            aria-label={t("settings.appearance.themes.customCss.enableFor", {
              target: t(`settings.appearance.themes.${target}`),
            })}
            checked={preferences.customCss[target]}
            onChange={(event) => onCustomCssEnabledChange(target, event.currentTarget.checked)}
          />
          <span aria-hidden="true" />
        </span>
      </label>
      <textarea
        className="desktop-theme-custom-css-source"
        aria-label={t("settings.appearance.themes.customCss.source")}
        value={source}
        disabled={loading}
        spellCheck={false}
        onChange={(event) => {
          setSource(event.currentTarget.value);
          setSaved(false);
        }}
      />
      <div className="desktop-theme-settings-actions">
        <button
          className="desktop-settings-action desktop-theme-custom-css-save"
          type="button"
          disabled={loading || saving}
          onClick={() => void save()}
        >
          {saving
            ? t("settings.appearance.themes.customCss.saving")
            : t("settings.appearance.themes.customCss.saveApply")}
        </button>
        {saved && (
          <span className="desktop-theme-custom-css-saved" role="status">
            {t("settings.appearance.themes.customCss.saved")}
          </span>
        )}
      </div>
    </div>
  );
}

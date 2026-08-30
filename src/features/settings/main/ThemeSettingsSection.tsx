import { useLocalization } from "@puppyone/localization";
import { getThemePacks } from "../../themes/builtinSurfaceThemes";
import { THEME_MARKETPLACE_URL } from "../../themes/themeMarketplace";
import type { ThemeCatalogController } from "../../themes/useThemeCatalog";
import type { SurfaceThemePreferences } from "../../themes/themePreferences";

export function ThemeSettingsSection({
  catalog,
  preferences,
  onThemePackChange,
}: {
  catalog: ThemeCatalogController;
  preferences: SurfaceThemePreferences;
  onThemePackChange: (themeId: string) => void;
}) {
  const { t } = useLocalization();
  const packs = getThemePacks(catalog.snapshot);
  const selectedPackExists = packs.some((theme) => theme.id === preferences.pack);
  const onAddTheme = () => {
    if (!THEME_MARKETPLACE_URL) return;
    void window.puppyoneDesktop?.openExternalUrl(THEME_MARKETPLACE_URL);
  };

  return (
    <div className="desktop-theme-settings-section">
      <div className="desktop-settings-subsection-title">
        {t("settings.appearance.themes.title")}
      </div>
      <div className="desktop-settings-list">
        <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
          <label className="desktop-theme-pack-label" htmlFor="desktop-theme-pack-select">
            {t("settings.appearance.themes.pack")}
          </label>
          <div className="desktop-theme-pack-controls">
            <select
              id="desktop-theme-pack-select"
              className="desktop-settings-select desktop-theme-pack-select"
              value={preferences.pack}
              onChange={(event) => onThemePackChange(event.currentTarget.value)}
            >
              {!selectedPackExists && (
                <option value={preferences.pack}>{t("settings.appearance.themes.missing", { id: preferences.pack })}</option>
              )}
              {packs.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </select>
          </div>
        </div>
        <div className="desktop-settings-row desktop-settings-row-control desktop-theme-settings-action-row">
          <div className="desktop-theme-settings-actions desktop-theme-settings-primary-actions">
            <button
              className="desktop-settings-action"
              type="button"
              onClick={() => void catalog.openDirectory()}
            >
              {t("settings.appearance.themes.openFolder")}
            </button>
            <button
              className="desktop-settings-action desktop-theme-add-action"
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
    </div>
  );
}

import { useLocalization } from "@puppyone/localization";
import { getThemePacks, getThemesForTarget } from "../../themes/builtinSurfaceThemes";
import type { ThemeCatalogController } from "../../themes/useThemeCatalog";
import type { SurfaceThemePreferences } from "../../themes/themePreferences";
import type { ThemeTarget } from "../../themes/themeTypes";

export function ThemeSettingsSection({
  catalog,
  preferences,
  onThemeOverrideChange,
  onThemePackChange,
}: {
  catalog: ThemeCatalogController;
  preferences: SurfaceThemePreferences;
  onThemeOverrideChange: (target: ThemeTarget, themeId: string | null) => void;
  onThemePackChange: (themeId: string) => void;
}) {
  const { t } = useLocalization();
  const onReload = () => void catalog.reload();
  const onOpenDirectory = () => void catalog.openDirectory();
  const packs = getThemePacks(catalog.snapshot);
  const selectedPackExists = packs.some((theme) => theme.id === preferences.pack);

  return (
    <div className="desktop-theme-settings-section">
      <div className="desktop-settings-subsection-title">
        {t("settings.appearance.themes.title")}
      </div>
      <p className="desktop-theme-settings-detail">{t("settings.appearance.themes.detail")}</p>
      <div className="desktop-settings-list">
        <label className="desktop-settings-row desktop-settings-row-control">
          <span>{t("settings.appearance.themes.pack")}</span>
          <select
            className="desktop-settings-select"
            aria-label={t("settings.appearance.themes.pack")}
            value={preferences.pack}
            onChange={(event) => onThemePackChange(event.currentTarget.value)}
          >
            {!selectedPackExists && (
              <option value={preferences.pack}>{t("settings.appearance.themes.missing", { id: preferences.pack })}</option>
            )}
            {packs.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
          </select>
        </label>
      </div>
      <details className="desktop-theme-settings-advanced">
        <summary>{t("settings.appearance.themes.advanced")}</summary>
        <div className="desktop-settings-list">
          <ThemeSelector target="application" labelKey="settings.appearance.themes.application" preferences={preferences} catalog={catalog} onThemeOverrideChange={onThemeOverrideChange} />
          <ThemeSelector target="markdown" labelKey="settings.appearance.themes.markdown" preferences={preferences} catalog={catalog} onThemeOverrideChange={onThemeOverrideChange} />
          <ThemeSelector target="csv" labelKey="settings.appearance.themes.csv" preferences={preferences} catalog={catalog} onThemeOverrideChange={onThemeOverrideChange} />
        </div>
        <div className="desktop-theme-settings-actions">
          <button className="desktop-settings-action" type="button" onClick={onOpenDirectory}>
            {t("settings.appearance.themes.openFolder")}
          </button>
          <button className="desktop-settings-action" type="button" disabled={catalog.status === "loading"} onClick={onReload}>
            {t("settings.appearance.themes.reload")}
          </button>
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
      </details>
    </div>
  );
}

function ThemeSelector({
  catalog,
  labelKey,
  onThemeOverrideChange,
  preferences,
  target,
}: {
  catalog: ThemeCatalogController;
  labelKey: string;
  onThemeOverrideChange: (target: ThemeTarget, themeId: string | null) => void;
  preferences: SurfaceThemePreferences;
  target: ThemeTarget;
}) {
  const { t } = useLocalization();
  const themes = getThemesForTarget(catalog.snapshot, target);
  const value = preferences.overrides[target];
  const selectedThemeExists = value === null || themes.some((theme) => theme.id === value);
  const label = t(labelKey);
  return (
    <label className="desktop-settings-row desktop-settings-row-control">
      <span>{label}</span>
      <select
        className="desktop-settings-select"
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onThemeOverrideChange(target, event.currentTarget.value || null)}
      >
        <option value="">{t("settings.appearance.themes.followPack", { theme: preferences.pack })}</option>
        {!selectedThemeExists && value && (
          <option value={value}>{t("settings.appearance.themes.missing", { id: value })}</option>
        )}
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>{theme.name}</option>
        ))}
      </select>
    </label>
  );
}

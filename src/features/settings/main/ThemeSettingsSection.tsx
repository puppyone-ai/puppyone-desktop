import { useLocalization } from "@puppyone/localization";
import { getThemesForTarget } from "../../themes/builtinSurfaceThemes";
import type { ThemeCatalogController } from "../../themes/useThemeCatalog";
import type { SurfaceThemePreferences } from "../../themes/themePreferences";
import type { ThemeTarget } from "../../themes/themeTypes";

export function ThemeSettingsSection({
  catalog,
  preferences,
  onThemeChange,
}: {
  catalog: ThemeCatalogController;
  preferences: SurfaceThemePreferences;
  onThemeChange: (target: ThemeTarget, themeId: string) => void;
}) {
  const { t } = useLocalization();
  const onReload = () => void catalog.reload();
  const onOpenDirectory = () => void catalog.openDirectory();

  return (
    <div className="desktop-theme-settings-section">
      <div className="desktop-settings-subsection-title">
        {t("settings.editor.themes.title")}
      </div>
      <p className="desktop-theme-settings-detail">{t("settings.editor.themes.detail")}</p>
      <div className="desktop-settings-list">
        <ThemeSelector target="application" labelKey="settings.editor.themes.application" value={preferences.application} catalog={catalog} onThemeChange={onThemeChange} />
        <ThemeSelector target="markdown" labelKey="settings.editor.themes.markdown" value={preferences.markdown} catalog={catalog} onThemeChange={onThemeChange} />
        <ThemeSelector target="csv" labelKey="settings.editor.themes.csv" value={preferences.csv} catalog={catalog} onThemeChange={onThemeChange} />
      </div>
      <div className="desktop-theme-settings-actions">
        <button className="desktop-settings-action" type="button" onClick={onOpenDirectory}>
          {t("settings.editor.themes.openFolder")}
        </button>
        <button className="desktop-settings-action" type="button" disabled={catalog.status === "loading"} onClick={onReload}>
          {t("settings.editor.themes.reload")}
        </button>
      </div>
      {catalog.error && <p className="desktop-theme-settings-error" role="alert">{catalog.error}</p>}
      {catalog.snapshot.diagnostics.length > 0 && (
        <ul className="desktop-theme-settings-diagnostics" aria-label={t("settings.editor.themes.diagnostics")}>
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

function ThemeSelector({
  catalog,
  labelKey,
  onThemeChange,
  target,
  value,
}: {
  catalog: ThemeCatalogController;
  labelKey: string;
  onThemeChange: (target: ThemeTarget, themeId: string) => void;
  target: ThemeTarget;
  value: string;
}) {
  const { t } = useLocalization();
  const themes = getThemesForTarget(catalog.snapshot, target);
  const selectedThemeExists = themes.some((theme) => theme.id === value);
  const label = t(labelKey);
  return (
    <label className="desktop-settings-row desktop-settings-row-control">
      <span>{label}</span>
      <select
        className="desktop-settings-select"
        aria-label={label}
        value={value}
        onChange={(event) => onThemeChange(target, event.currentTarget.value)}
      >
        {!selectedThemeExists && (
          <option value={value}>{t("settings.editor.themes.missing", { id: value })}</option>
        )}
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>{theme.name}</option>
        ))}
      </select>
    </label>
  );
}

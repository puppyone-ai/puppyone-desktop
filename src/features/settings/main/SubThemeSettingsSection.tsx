import { useLocalization } from "@puppyone/localization";
import {
  getCompatibleSubThemes,
} from "../../themes/builtinSubThemes";
import { THEME_MARKETPLACE_URL } from "../../themes/themeMarketplace";
import type { SubThemeCatalogController } from "../../themes/useSubThemeCatalog";
import type { InterfaceStyle, ResolvedTheme } from "../../appearance/interfaceStyles";
import { getInterfaceStyleSubThemePolicy } from "../../appearance/interfaceStyles";

export function SubThemeSettingsSection({
  catalog,
  rootThemeId,
  requestedSubThemeId,
  effectiveSubThemeId,
  effectiveColorMode,
  onSubThemeChange,
}: {
  catalog: SubThemeCatalogController;
  rootThemeId: InterfaceStyle;
  requestedSubThemeId: string;
  effectiveSubThemeId: string;
  effectiveColorMode: ResolvedTheme;
  onSubThemeChange: (subThemeId: string) => void;
}) {
  const { t } = useLocalization();
  const allowedTargets = getInterfaceStyleSubThemePolicy(rootThemeId).allowedTargets;
  const variants = getCompatibleSubThemes(catalog.snapshot, rootThemeId, effectiveColorMode).filter((subTheme) => (
    allowedTargets.every((target) => subTheme.targets.includes(target))
  ));
  const selectedExists = variants.some((subTheme) => subTheme.id === requestedSubThemeId);
  const requestedExistsInCatalog = catalog.snapshot.subThemes.some(
    (subTheme) => subTheme.id === requestedSubThemeId,
  );
  const effective = variants.find((subTheme) => subTheme.id === effectiveSubThemeId);
  const selectValue = selectedExists ? requestedSubThemeId : effectiveSubThemeId;
  const onAddTheme = () => {
    if (!THEME_MARKETPLACE_URL) return;
    void window.puppyoneDesktop?.openExternalUrl(THEME_MARKETPLACE_URL);
  };

  return (
    <div className="desktop-theme-settings-section">
      <div className="desktop-settings-list">
        <div className="desktop-settings-row desktop-settings-row-control desktop-settings-wide-control-row">
          <label className="desktop-theme-pack-label" htmlFor="desktop-sub-theme-select">
            <span>{t("settings.appearance.themes.pack")}</span>
            <span className="desktop-sub-theme-mode-badge">
              {t(`settings.appearance.theme.${effectiveColorMode}`)}
            </span>
          </label>
          <div className="desktop-theme-pack-controls">
            <div className="desktop-theme-pack-picker">
              {variants.length <= 1 ? (
                <span className="desktop-appearance-policy-reason">
                  {effective?.name ?? effectiveSubThemeId}
                </span>
              ) : (
                <select
                  id="desktop-sub-theme-select"
                  className="desktop-settings-select desktop-theme-pack-select"
                  value={selectValue}
                  onChange={(event) => onSubThemeChange(event.currentTarget.value)}
                >
                  {!selectedExists && !requestedExistsInCatalog && (
                    <option value={requestedSubThemeId}>
                      {t("settings.appearance.themes.missing", { id: requestedSubThemeId })}
                    </option>
                  )}
                  {variants.map((subTheme) => (
                    <option key={subTheme.id} value={subTheme.id}>{subTheme.name}</option>
                  ))}
                </select>
              )}
            </div>
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

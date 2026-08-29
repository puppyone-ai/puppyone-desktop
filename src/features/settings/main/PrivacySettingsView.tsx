import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useLocalization } from "@puppyone/localization";
import { DESKTOP_TELEMETRY_DISCLOSURE_URL } from "../../telemetry/publicDisclosure";
import type { DesktopTelemetryState } from "../../../types/electron";
import { SettingsSectionHeader, SettingsToggle } from "../components";

export function PrivacySettingsView() {
  const { t } = useLocalization();
  const [state, setState] = useState<DesktopTelemetryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const telemetry = window.puppyoneDesktop;
    if (!telemetry?.getTelemetryState || !telemetry.onTelemetryStateChanged) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    void telemetry.getTelemetryState()
      .then((nextState) => {
        if (!active) return;
        setState(nextState);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    const unsubscribe = telemetry.onTelemetryStateChanged((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const updateAnalytics = useCallback(async (checked: boolean) => {
    const setTelemetryLevel = window.puppyoneDesktop?.setTelemetryLevel;
    if (!setTelemetryLevel || saving) return;
    setSaving(true);
    setError(false);
    try {
      setState(await setTelemetryLevel({ level: checked ? "basic" : "off" }));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const openDisclosure = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    const openExternalUrl = window.puppyoneDesktop?.openExternalUrl;
    if (!openExternalUrl) return;
    event.preventDefault();
    void openExternalUrl(DESKTOP_TELEMETRY_DISCLOSURE_URL);
  }, []);

  const available = state?.eligible === true;
  const description = state && !available
    ? t("settings.privacy.analytics.unavailable")
    : t("settings.privacy.analytics.detail");

  return (
    <section className="desktop-utility-view desktop-settings-view">
      <div className="desktop-utility-body desktop-settings-body" data-po-scrollbar="content">
        <div className="desktop-settings-section desktop-privacy-settings">
          <SettingsSectionHeader
            title={t("settings.privacy.title")}
            detail={t("settings.privacy.detail")}
          />
          <div className="desktop-settings-list">
            <div
              className="desktop-settings-row desktop-settings-row-control desktop-privacy-analytics-row"
              aria-busy={loading || saving}
            >
              <div className="desktop-privacy-setting-copy">
                <span className="desktop-privacy-setting-title">
                  {t("settings.privacy.analytics.title")}
                </span>
                <span className="desktop-privacy-setting-detail">
                  {description}{" "}
                  <a
                    href={DESKTOP_TELEMETRY_DISCLOSURE_URL}
                    onClick={openDisclosure}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("settings.privacy.analytics.learnMore")}
                  </a>
                </span>
                {error && (
                  <span className="desktop-privacy-setting-error" role="alert">
                    {t("settings.privacy.analytics.error")}
                  </span>
                )}
              </div>
              <SettingsToggle
                checked={state?.level === "basic"}
                description={description}
                disabled={loading || saving || !available}
                label={t("settings.privacy.analytics.title")}
                onChange={(checked) => void updateAnalytics(checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

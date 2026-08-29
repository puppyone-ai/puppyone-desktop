import { useLocalization } from "@puppyone/localization";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type { DesktopTelemetryState } from "../../types/electron";

const TELEMETRY_DISCLOSURE_URL = "https://github.com/puppyone-ai/puppyone-desktop/blob/qubits/docs/telemetry.md";

type OnboardingTelemetryDisclosureProps = {
  ready: boolean;
};

/** A versioned, one-time disclosure shown below the first empty-project CTA. */
export function OnboardingTelemetryDisclosure({ ready }: OnboardingTelemetryDisclosureProps) {
  const { t } = useLocalization();
  const [state, setState] = useState<DesktopTelemetryState | null>(null);
  const [shownForLaunch, setShownForLaunch] = useState(false);
  const preview = import.meta.env.DEV
    && import.meta.env.VITE_TELEMETRY_NOTICE_PREVIEW === "1";

  useEffect(() => {
    const telemetry = window.puppyoneDesktop;
    if (!telemetry?.getTelemetryState || !telemetry.onTelemetryStateChanged) return undefined;

    let active = true;
    void telemetry.getTelemetryState()
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch(() => {
        if (active) setState(null);
      });
    const unsubscribe = telemetry.onTelemetryStateChanged((nextState) => {
      if (active) setState(nextState);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const required = shouldShowOnboardingTelemetryDisclosure(state);

  useEffect(() => {
    if (!ready || shownForLaunch || (!preview && !required)) return;
    setShownForLaunch(true);
    if (preview) return;

    const markNoticeSeen = window.puppyoneDesktop?.markTelemetryNoticeSeen;
    if (!markNoticeSeen) return;
    void markNoticeSeen()
      .then(setState)
      .catch(() => undefined);
  }, [preview, ready, required, shownForLaunch]);

  const openDisclosure = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    const openExternalUrl = window.puppyoneDesktop?.openExternalUrl;
    if (!openExternalUrl) return;
    event.preventDefault();
    void openExternalUrl(TELEMETRY_DISCLOSURE_URL);
  }, []);

  if (!ready || (!shownForLaunch && !preview && !required)) return null;

  return (
    <p
      className="onboarding-telemetry-disclosure"
      data-onboarding-telemetry-disclosure=""
      role="note"
    >
      {t("onboarding.telemetry.notice")}{" "}
      <a
        href={TELEMETRY_DISCLOSURE_URL}
        onClick={openDisclosure}
        rel="noreferrer"
        target="_blank"
      >
        {t("onboarding.telemetry.learnMore")}
      </a>
    </p>
  );
}

export function shouldShowOnboardingTelemetryDisclosure(state: DesktopTelemetryState | null) {
  return Boolean(
    state?.eligible
    && state.noticeRequired
    && state.level === "basic",
  );
}

import { useLocalization } from "@puppyone/localization";
import { Button } from "@puppyone/shared-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DesktopTelemetryState } from "../../types/electron";

const TELEMETRY_NOTICE_PREVIEW_HASH = "#telemetry-notice-preview";
const TELEMETRY_NOTICE_PREVIEW_LABELS = Object.freeze({
  title: "Help improve puppyone",
  description: "Share anonymous daily activity—never files or prompts.",
  learnMore: "Details",
  showLess: "Less",
  details: "At most one anonymous activity record is sent per UTC day. The identifier changes every calendar month.",
  notNow: "Later",
  understand: "I understand",
  error: "Couldn’t update your analytics preference. Please try again.",
});

export function DesktopTelemetryNotice() {
  const { t } = useLocalization();
  const [state, setState] = useState<DesktopTelemetryState | null>(null);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const preview = import.meta.env.DEV && window.location.hash === TELEMETRY_NOTICE_PREVIEW_HASH;

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

  const visible = !dismissedForSession && (
    preview || shouldShowDesktopTelemetryNotice(state)
  );
  const labels = useMemo(() => preview ? ({
    ...TELEMETRY_NOTICE_PREVIEW_LABELS,
    learnMore: detailsOpen
      ? TELEMETRY_NOTICE_PREVIEW_LABELS.showLess
      : TELEMETRY_NOTICE_PREVIEW_LABELS.learnMore,
  }) : ({
    title: t("telemetry.notice.title"),
    description: t("telemetry.notice.description"),
    learnMore: t(detailsOpen ? "telemetry.notice.showLess" : "telemetry.notice.learnMore"),
    details: t("telemetry.notice.details"),
    notNow: t("telemetry.notice.notNow"),
    understand: t("telemetry.notice.understand"),
    error: t("telemetry.notice.error"),
  }), [detailsOpen, preview, t]);

  const handleAccept = useCallback(async () => {
    if (preview) {
      setDismissedForSession(true);
      return;
    }
    const telemetry = window.puppyoneDesktop;
    if (!telemetry?.markTelemetryNoticeSeen) return;
    setSubmitting(true);
    setError(false);
    try {
      const nextState = await telemetry.markTelemetryNoticeSeen();
      setState(nextState);
      setDismissedForSession(true);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }, [preview]);

  if (!visible) return null;

  return (
    <section
      aria-labelledby="desktop-telemetry-notice-title"
      aria-modal="false"
      className="desktop-telemetry-notice"
      data-details-open={detailsOpen ? "true" : "false"}
      role="dialog"
    >
      <div className="desktop-telemetry-notice-heading">
        <h2 id="desktop-telemetry-notice-title">{labels.title}</h2>
      </div>
      <p className="desktop-telemetry-notice-description">
        {labels.description}{" "}
        <button
          aria-expanded={detailsOpen}
          className="desktop-telemetry-notice-learn-more"
          onClick={() => setDetailsOpen((open) => !open)}
          type="button"
        >
          {labels.learnMore}
        </button>
      </p>
      {detailsOpen && (
        <p className="desktop-telemetry-notice-details">{labels.details}</p>
      )}
      {error && (
        <p className="desktop-telemetry-notice-error" role="alert">{labels.error}</p>
      )}
      <div className="desktop-telemetry-notice-footer">
        <div className="desktop-telemetry-notice-actions">
          <Button
            className="desktop-telemetry-notice-not-now"
            disabled={submitting}
            onClick={() => setDismissedForSession(true)}
          >
            {labels.notNow}
          </Button>
          <Button
            className="desktop-telemetry-notice-understand"
            disabled={submitting}
            onClick={() => void handleAccept()}
            tone="primary"
          >
            {labels.understand}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function shouldShowDesktopTelemetryNotice(state: DesktopTelemetryState | null) {
  return Boolean(
    state?.eligible
    && state.noticeRequired
    && state.transportConfigured
    && state.level === "basic",
  );
}

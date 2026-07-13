import { AlertTriangle, CheckCircle2, Download, RefreshCw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocalization, type MessageFormatter } from "@puppyone/localization";
import type { DesktopUpdateState, DesktopUpdateStatus } from "../types/electron";

const FALLBACK_UPDATE_STATE: DesktopUpdateState = {
  status: "disabled",
  currentVersion: "0.0.0",
  channel: "stable",
  availableVersion: null,
  updateInfo: null,
  progress: null,
  blockers: [],
  error: null,
  reason: null,
  lastCheckedAt: null,
  updatedAt: new Date(0).toISOString(),
};

type DesktopUpdatesController = {
  state: DesktopUpdateState;
  checkForUpdates: () => Promise<void>;
  updateNow: () => Promise<void>;
};

export function useDesktopUpdates(): DesktopUpdatesController {
  const [state, setState] = useState<DesktopUpdateState>(FALLBACK_UPDATE_STATE);

  useEffect(() => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.getUpdateState) return undefined;

    let cancelled = false;
    bridge.getUpdateState()
      .then((nextState) => {
        if (!cancelled) setState(normalizeUpdateState(nextState));
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            ...FALLBACK_UPDATE_STATE,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    const unsubscribe = bridge.onUpdateStateChanged?.((nextState) => {
      setState(normalizeUpdateState(nextState));
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.checkForUpdates) return;
    setState(normalizeUpdateState(await bridge.checkForUpdates()));
  }, []);

  const updateNow = useCallback(async () => {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.updateNow) return;
    setState(normalizeUpdateState(await bridge.updateNow()));
  }, []);

  return { state, checkForUpdates, updateNow };
}

export function DesktopUpdateTitlebarButton({
  state,
  onUpdateNow,
}: {
  state: DesktopUpdateState;
  onUpdateNow: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  const visible = state.status === "available"
    || state.status === "downloading"
    || state.status === "downloaded"
    || state.status === "blocked"
    || state.status === "error";

  if (!visible) return null;

  const Icon = getUpdateIcon(state.status);
  const busy = state.status === "checking" || state.status === "downloading" || state.status === "installing";

  return (
    <button
      className={`desktop-titlebar-action desktop-update-titlebar-action ${state.status}`}
      type="button"
      title={getUpdateTitle(state, t, formatNumber)}
      aria-label={getUpdateTitle(state, t, formatNumber)}
      disabled={busy}
      onClick={onUpdateNow}
    >
      <Icon size={15} className={busy ? "spin" : undefined} />
      {state.status === "available" && <span className="desktop-update-dot" aria-hidden />}
    </button>
  );
}

export function DesktopUpdateSettingsRow({
  state,
  onCheckForUpdates,
  onUpdateNow,
}: {
  state: DesktopUpdateState;
  onCheckForUpdates: () => void;
  onUpdateNow: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  const action = getSettingsAction(state, t, formatNumber);
  const Icon = getUpdateIcon(state.status);
  const detail = getUpdateDetail(state, t, formatNumber);

  return (
    <div className="desktop-settings-row desktop-settings-row-control desktop-update-settings-row">
      <span className="desktop-settings-label-stack">
        <strong>{t("updates.settings.title")}</strong>
        <small>{detail}</small>
        {state.blockers.length > 0 && (
          <small className="desktop-update-blocker">{state.blockers[0]?.detail ?? state.blockers[0]?.label}</small>
        )}
        {state.error && (
          <small className="desktop-update-blocker">{state.error}</small>
        )}
      </span>
      <button
        className={`desktop-settings-action ${action.primary ? "primary" : ""}`}
        type="button"
        disabled={action.disabled}
        onClick={action.kind === "check" ? onCheckForUpdates : onUpdateNow}
      >
        <Icon size={14} className={action.spinning ? "spin" : undefined} />
        <span>{action.label}</span>
      </button>
    </div>
  );
}

function normalizeUpdateState(value: DesktopUpdateState | null | undefined): DesktopUpdateState {
  if (!value || typeof value !== "object") return FALLBACK_UPDATE_STATE;
  return {
    ...FALLBACK_UPDATE_STATE,
    ...value,
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
  };
}

function getUpdateIcon(status: DesktopUpdateStatus) {
  if (status === "downloaded" || status === "installing") return RotateCw;
  if (status === "checking" || status === "downloading") return RefreshCw;
  if (status === "error" || status === "blocked") return AlertTriangle;
  if (status === "not-available") return CheckCircle2;
  return Download;
}

function getSettingsAction(
  state: DesktopUpdateState,
  t: MessageFormatter,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): {
  kind: "check" | "update";
  label: string;
  disabled: boolean;
  spinning: boolean;
  primary: boolean;
} {
  if (state.status === "disabled") {
    return { kind: "check", label: t("updates.action.unavailable"), disabled: true, spinning: false, primary: false };
  }
  if (state.status === "checking") {
    return { kind: "check", label: t("updates.action.checking"), disabled: true, spinning: true, primary: false };
  }
  if (state.status === "downloading") {
    return {
      kind: "update",
      label: formatDownloadProgress(state, formatNumber),
      disabled: true,
      spinning: true,
      primary: true,
    };
  }
  if (state.status === "installing") {
    return { kind: "update", label: t("updates.action.restarting"), disabled: true, spinning: true, primary: true };
  }
  if (state.status === "downloaded") {
    return { kind: "update", label: t("updates.action.restart"), disabled: false, spinning: false, primary: true };
  }
  if (state.status === "available" || state.status === "blocked") {
    return { kind: "update", label: t("updates.action.updateNow"), disabled: false, spinning: false, primary: true };
  }
  if (state.status === "error") {
    return { kind: "update", label: t("updates.action.tryAgain"), disabled: false, spinning: false, primary: false };
  }
  return { kind: "check", label: t("updates.action.check"), disabled: false, spinning: false, primary: false };
}

function getUpdateTitle(
  state: DesktopUpdateState,
  t: MessageFormatter,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  if (state.status === "available") return t("updates.title.available", { version: state.availableVersion ?? t("updates.version.new") });
  if (state.status === "downloaded") return t("updates.action.restart");
  if (state.status === "downloading") return t("updates.title.downloading", { progress: formatDownloadProgress(state, formatNumber) });
  if (state.status === "blocked") return state.blockers[0]?.label ?? t("updates.title.blocked");
  if (state.status === "error") return t("updates.title.failed");
  return t("updates.title.appUpdate");
}

function getUpdateDetail(
  state: DesktopUpdateState,
  t: MessageFormatter,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  if (state.status === "disabled") return state.reason ?? t("updates.detail.disabled");
  if (state.status === "idle") return t("updates.detail.idle", { version: state.currentVersion, channel: state.channel });
  if (state.status === "checking") return t("updates.detail.checking");
  if (state.status === "not-available") return t("updates.detail.current", { version: state.currentVersion });
  if (state.status === "available") return t("updates.detail.available", { version: state.availableVersion ?? t("updates.version.new") });
  if (state.status === "downloading") return t("updates.detail.downloading", { progress: formatDownloadProgress(state, formatNumber) });
  if (state.status === "downloaded") return t("updates.detail.downloaded", { version: state.availableVersion ?? t("updates.version.new") });
  if (state.status === "installing") return t("updates.detail.installing");
  if (state.status === "blocked") return t("updates.detail.blocked");
  if (state.status === "error") return t("updates.detail.error");
  return t("updates.detail.unknown");
}

function formatDownloadProgress(
  state: DesktopUpdateState,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
): string {
  const percent = Math.max(0, Math.min(100, Math.round(state.progress?.percent ?? 0)));
  return formatNumber(percent / 100, { style: "percent", maximumFractionDigits: 0 });
}

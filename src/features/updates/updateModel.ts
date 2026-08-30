import type { DesktopUpdateState } from "../../types/electron";
import { evaluateDesktopUpdateCandidate } from "../../../shared/desktop/update-policy.mjs";

export const FALLBACK_UPDATE_STATE: DesktopUpdateState = {
  status: "disabled",
  currentVersion: "0.0.0-dev.local",
  channel: "dev",
  availableVersion: null,
  updateInfo: null,
  progress: null,
  blockers: [],
  error: null,
  reason: null,
  lastCheckedAt: null,
  updatedAt: new Date(0).toISOString(),
};

export type DesktopUpdateTitlebarState = {
  kind: "available" | "downloading" | "ready" | "installing";
  interactive: boolean;
  version: string | null;
  progressPercent: number | null;
};

export function normalizeDesktopUpdateState(
  value: DesktopUpdateState | null | undefined,
): DesktopUpdateState {
  if (!value || typeof value !== "object") return FALLBACK_UPDATE_STATE;
  const normalized = {
    ...FALLBACK_UPDATE_STATE,
    ...value,
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
  };
  if (!isActionableStatus(normalized.status)) return normalized;

  const evaluation = evaluateDesktopUpdateCandidate({
    channel: normalized.channel,
    currentVersion: normalized.currentVersion,
    candidateVersion: normalized.availableVersion,
  });
  if (evaluation.allowed) return normalized;

  const invalid = evaluation.relation === "invalid" || !evaluation.channelCompatible;
  return {
    ...normalized,
    status: invalid ? "error" : "not-available",
    availableVersion: null,
    updateInfo: null,
    progress: null,
    blockers: [],
    error: invalid ? "The update feed returned an invalid or cross-channel version." : null,
  };
}

/**
 * The titlebar is intentionally quieter than Settings. It becomes visible
 * only after the updater has positively identified a newer version and never
 * renders idle, checking, current, disabled, or error states.
 */
export function getDesktopUpdateTitlebarState(
  value: DesktopUpdateState | null | undefined,
): DesktopUpdateTitlebarState | null {
  const state = normalizeDesktopUpdateState(value);
  if (state.status === "available") {
    return {
      kind: "available",
      interactive: true,
      version: state.availableVersion,
      progressPercent: null,
    };
  }
  if (state.status === "downloading") {
    return {
      kind: "downloading",
      interactive: false,
      version: state.availableVersion,
      progressPercent: normalizeProgressPercent(state.progress?.percent),
    };
  }
  if (state.status === "downloaded" || state.status === "blocked") {
    return {
      kind: "ready",
      interactive: true,
      version: state.availableVersion,
      progressPercent: null,
    };
  }
  if (state.status === "installing") {
    return {
      kind: "installing",
      interactive: false,
      version: state.availableVersion,
      progressPercent: null,
    };
  }
  return null;
}

function normalizeProgressPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value ?? 0)));
}

function isActionableStatus(status: DesktopUpdateState["status"]) {
  return status === "available"
    || status === "downloading"
    || status === "downloaded"
    || status === "blocked"
    || status === "installing";
}

import type { DesktopUpdateState } from "../../types/electron";

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
  return {
    ...FALLBACK_UPDATE_STATE,
    ...value,
    blockers: Array.isArray(value.blockers) ? value.blockers : [],
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

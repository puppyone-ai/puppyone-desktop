import { Download, RefreshCw, RotateCw } from "lucide-react";
import { useLocalization } from "@puppyone/localization";
import type { DesktopUpdateState } from "../../types/electron";
import { getDesktopUpdateTitlebarState } from "./updateModel";

export function DesktopUpdateTitlebarButton({
  state,
  onUpdateNow,
}: {
  state: DesktopUpdateState;
  onUpdateNow: () => void;
}) {
  const { t, formatNumber } = useLocalization();
  const presentation = getDesktopUpdateTitlebarState(state);
  if (!presentation) return null;

  const progress = formatNumber((presentation.progressPercent ?? 0) / 100, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const version = presentation.version ?? t("updates.version.new");
  const label = presentation.kind === "available"
    ? t("updates.title.available", { version })
    : presentation.kind === "downloading"
      ? t("updates.title.downloading", { progress })
      : presentation.kind === "ready"
        ? state.status === "blocked"
          ? t("updates.detail.blocked")
          : t("updates.detail.downloaded", { version })
        : t("updates.detail.installing");
  const buttonLabel = presentation.kind === "available"
    ? t("updates.action.download")
    : presentation.kind === "downloading"
      ? t("updates.title.downloading", { progress })
      : presentation.kind === "ready"
        ? t("updates.action.restart")
        : t("updates.action.restarting");
  const Icon = presentation.kind === "available"
    ? Download
    : presentation.kind === "ready"
      ? RotateCw
      : RefreshCw;

  return (
    <button
      className={`desktop-titlebar-action desktop-titlebar-update is-${presentation.kind}`}
      type="button"
      title={label}
      aria-label={label}
      aria-busy={!presentation.interactive || undefined}
      disabled={!presentation.interactive}
      onClick={onUpdateNow}
    >
      <Icon
        size={15}
        strokeWidth={2.3}
        className={presentation.kind === "downloading" || presentation.kind === "installing"
          ? "spin"
          : undefined}
        aria-hidden="true"
      />
      <span className="desktop-titlebar-update-label">{buttonLabel}</span>
    </button>
  );
}

import { AlertCircle, Play } from "lucide-react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import type { AppPreviewViewState } from "./types";

export function AppPreviewStateView({
  appName,
  state,
  canRun,
  onRun,
}: {
  appName: string;
  state: AppPreviewViewState;
  canRun: boolean;
  onRun: () => void;
}) {
  const { t } = useLocalization();

  if (state.status === "error") {
    return (
      <div className="app-preview-state danger">
        <AlertCircle size={22} strokeWidth={1.9} aria-hidden="true" />
        <strong>{t("editor.app.failed")}</strong>
        <span dir="auto">
          {state.error?.code === "unavailable"
            ? t("editor.app.unavailable")
            : state.error?.detail || t("editor.app.startFailed")}
        </span>
        <button type="button" disabled={!canRun} onClick={onRun}>
          <Play size={13} aria-hidden="true" />
          {t("editor.app.run")}
        </button>
      </div>
    );
  }

  if (state.status === "stopped") {
    return (
      <div className="app-preview-state">
        <strong>{t("editor.app.stoppedName", { name: bidiIsolate(appName) })}</strong>
        <span>{t("editor.app.stoppedHint")}</span>
        <button type="button" disabled={!canRun} onClick={onRun}>
          <Play size={13} aria-hidden="true" />
          {t("editor.app.run")}
        </button>
      </div>
    );
  }

  return (
    <div className="app-preview-state">
      <div className="app-preview-spinner" aria-hidden="true" />
      <strong>
        {state.status === "starting"
          ? t("editor.app.startingName", { name: bidiIsolate(appName) })
          : t("editor.app.preparingName", { name: bidiIsolate(appName) })}
      </strong>
      <span>
        {state.status === "starting"
          ? t("editor.app.preparingLocal")
          : t("editor.app.waitingRuntime")}
      </span>
    </div>
  );
}

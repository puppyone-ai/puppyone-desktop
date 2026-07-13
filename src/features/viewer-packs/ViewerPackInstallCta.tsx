"use client";

import { useCallback, useState } from "react";
import type { EditorDocument } from "@puppyone/shared-ui";
import { bidiIsolate, useLocalization } from "@puppyone/localization";

export type ViewerPackInstallCtaProps = {
  document: EditorDocument;
  onInstalled?: () => void | Promise<void>;
};

function getDesktopBridge() {
  return typeof window !== "undefined" ? window.puppyoneDesktop?.viewerPacks ?? null : null;
}

/**
 * Opens the main-process picker. Package paths and bytes never cross the app
 * renderer, so the host can stat and cap both files before allocating memory.
 */
export function ViewerPackInstallCta({ document, onInstalled }: ViewerPackInstallCtaProps) {
  const { t } = useLocalization();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const install = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError(t("workspace.viewerPack.hostUnavailable"));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bridge.installLocal();
      if (result.canceled) return;
      setMessage(t("workspace.viewerPack.install.success", {
        plugin: bidiIsolate(`${result.pluginId}@${result.version}`),
      }));
      await onInstalled?.();
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      setBusy(false);
    }
  }, [onInstalled, t]);

  return (
    <div className="viewer-pack-install-cta">
      <strong>{t("workspace.viewerPack.install.missing", { name: bidiIsolate(document.name) })}</strong>
      <p>{t("workspace.viewerPack.install.description", {
        packageExtension: bidiIsolate(".puppyplugin"),
        signatureExtension: bidiIsolate(".sig"),
      })}</p>
      <button type="button" disabled={busy} onClick={() => void install()}>
        {t(busy ? "workspace.viewerPack.install.installing" : "workspace.viewerPack.install.action")}
      </button>
      {message && <span className="viewer-pack-install-cta-ok">{message}</span>}
      {error && <span className="viewer-pack-install-cta-error" role="alert">{error}</span>}
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import type { EditorDocument } from "@puppyone/shared-ui";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const install = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError("Viewer Pack host bridge is unavailable.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await bridge.installLocal();
      if (result.canceled) return;
      setMessage(`Installed ${result.pluginId}@${result.version}. Re-open the file to activate.`);
      await onInstalled?.();
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      setBusy(false);
    }
  }, [onInstalled]);

  return (
    <div className="viewer-pack-install-cta">
      <strong>No Viewer Pack installed for {document.name}</strong>
      <p>
        This local format is plugin-eligible. Select one signed <code>.puppyplugin</code>
        package and its JSON <code>.sig</code> envelope.
      </p>
      <button type="button" disabled={busy} onClick={() => void install()}>
        {busy ? "Installing…" : "Install local Viewer Pack"}
      </button>
      {message && <span className="viewer-pack-install-cta-ok">{message}</span>}
      {error && <span className="viewer-pack-install-cta-error" role="alert">{error}</span>}
    </div>
  );
}

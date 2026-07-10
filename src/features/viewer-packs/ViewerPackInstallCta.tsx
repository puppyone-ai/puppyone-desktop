"use client";

import { useCallback, useRef, useState } from "react";
import type { EditorDocument } from "@puppyone/shared-ui";

export type ViewerPackInstallCtaProps = {
  document: EditorDocument;
  /** Called after a successful local install so the host can refresh the snapshot. */
  onInstalled?: () => void | Promise<void>;
};

function getDesktopBridge() {
  if (typeof window === "undefined" || !window.puppyoneDesktop?.viewerPacks) {
    return null;
  }
  return window.puppyoneDesktop.viewerPacks;
}

/**
 * Local-install CTA shown when a placeholder-grade local document has no
 * matching enabled pack. Catalog transport is disabled by default, so this is
 * the only discovery path for Stage B1 — pick a signed `.puppyplugin` (+ `.sig`).
 */
export function ViewerPackInstallCta({ document, onInstalled }: ViewerPackInstallCtaProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onPickFiles = useCallback(async (fileList: FileList | null) => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setError("Viewer Pack host bridge is unavailable.");
      return;
    }
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const archive = files.find((file) => file.name.toLowerCase().endsWith(".puppyplugin"));
    const signatureFile = files.find((file) => file.name.toLowerCase().endsWith(".sig"));
    if (!archive) {
      setError("Select a signed .puppyplugin package (and its .sig companion).");
      return;
    }
    if (!signatureFile) {
      setError("A companion .sig file is required next to the .puppyplugin package.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const archiveBytes = new Uint8Array(await archive.arrayBuffer());
      const signatureBase64Url = (await signatureFile.text()).trim();
      const result = await bridge.installLocal({
        archiveBytes,
        signatureBase64Url,
        sourceLabel: archive.name,
      });
      setMessage(`Installed ${result.pluginId}@${result.version}. Re-open the file to activate.`);
      await onInstalled?.();
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [onInstalled]);

  return (
    <div className="viewer-pack-install-cta">
      <strong>No Viewer Pack installed for {document.name}</strong>
      <p>
        This format is plugin-eligible. Catalog discovery is disabled by default —
        install a signed first-party pack from a local <code>.puppyplugin</code> file
        (include the matching <code>.sig</code>).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".puppyplugin,.sig"
        multiple
        hidden
        onChange={(event) => void onPickFiles(event.target.files)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Installing…" : "Install local Viewer Pack"}
      </button>
      {message && <span className="viewer-pack-install-cta-ok">{message}</span>}
      {error && <span className="viewer-pack-install-cta-error" role="alert">{error}</span>}
    </div>
  );
}

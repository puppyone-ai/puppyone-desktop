"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorDocument } from "@puppyone/shared-ui";
import type { ViewerContribution, ViewerPackSessionDescriptor } from "@puppyone/shared-ui";

type Bounds = { x: number; y: number; width: number; height: number };

export type PluginSurfaceControllerProps = {
  document: EditorDocument;
  contribution: ViewerContribution;
  /** Absolute workspace root — required for main-process resource grants. */
  workspaceRoot: string;
};

function getDesktopBridge() {
  if (typeof window === "undefined" || !window.puppyoneDesktop?.viewerPacks) {
    return null;
  }
  return window.puppyoneDesktop.viewerPacks;
}

/**
 * Positions and lifecycle-manages a main-process WebContentsView for an
 * activated Viewer Pack. This component never executes pack code — it only
 * asks the main process to activate/setBounds/destroy via trusted app IPC.
 */
export function PluginSurfaceController({
  document,
  contribution,
  workspaceRoot,
}: PluginSurfaceControllerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<ViewerPackSessionDescriptor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"activating" | "ready" | "error">("activating");
  const sessionIdRef = useRef<string | null>(null);

  const publishBounds = useCallback(async (sessionId: string, bounds: Bounds) => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    await bridge.setBounds({ sessionId, bounds });
  }, []);

  const measureBounds = useCallback((): Bounds | null => {
    const el = hostRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bridge = getDesktopBridge();
    if (!bridge) {
      setStatus("error");
      setError("Viewer Pack host bridge is unavailable.");
      return undefined;
    }
    if (!workspaceRoot) {
      setStatus("error");
      setError("Workspace root is required to activate a Viewer Pack.");
      return undefined;
    }

    const bounds = measureBounds() ?? { x: 0, y: 0, width: 640, height: 480 };

    void (async () => {
      try {
        setStatus("activating");
        setError(null);
        const next = await bridge.activate({
          pluginId: contribution.pluginId,
          version: contribution.version,
          contentHash: contribution.contentHash,
          entry: contribution.viewer.entry,
          documentPath: document.path,
          documentName: document.name,
          documentMimeType: document.mimeType ?? null,
          rootPath: workspaceRoot,
          relativePath: document.path,
          bounds,
        });
        if (cancelled) {
          await bridge.destroySession({ sessionId: next.sessionId });
          return;
        }
        sessionIdRef.current = next.sessionId;
        setSession(next);
        setStatus("ready");
        const latest = measureBounds();
        if (latest) await publishBounds(next.sessionId, latest);
      } catch (activationError) {
        if (cancelled) return;
        setStatus("error");
        setError(activationError instanceof Error ? activationError.message : String(activationError));
      }
    })();

    return () => {
      cancelled = true;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) {
        void bridge.destroySession({ sessionId }).catch(() => undefined);
      }
    };
  }, [
    contribution.contentHash,
    contribution.pluginId,
    contribution.version,
    contribution.viewer.entry,
    document.mimeType,
    document.name,
    document.path,
    measureBounds,
    publishBounds,
    workspaceRoot,
  ]);

  useEffect(() => {
    const el = hostRef.current;
    const sessionId = session?.sessionId;
    if (!el || !sessionId) return undefined;

    const observer = new ResizeObserver(() => {
      const bounds = measureBounds();
      if (!bounds) return;
      void publishBounds(sessionId, bounds);
    });
    observer.observe(el);

    const onWindowChange = () => {
      const bounds = measureBounds();
      if (!bounds) return;
      void publishBounds(sessionId, bounds);
    };
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [measureBounds, publishBounds, session?.sessionId]);

  return (
    <div className="viewer-pack-surface" data-plugin-id={contribution.pluginId}>
      <div
        ref={hostRef}
        className="viewer-pack-surface-host"
        data-status={status}
        aria-label={`${contribution.label} viewer surface`}
      />
      {status === "activating" && (
        <div className="viewer-pack-surface-status">Activating {contribution.label}…</div>
      )}
      {status === "error" && (
        <div className="viewer-pack-surface-status viewer-pack-surface-status--error" role="alert">
          <strong>Viewer Pack failed to activate</strong>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

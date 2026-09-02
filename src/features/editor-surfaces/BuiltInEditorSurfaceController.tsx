import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization";
import type { PresetViewerContribution, PresetViewerRenderContext } from "@puppyone/shared-ui";
import { PageLoading } from "../../components/loading";
import "./editor-surfaces.css";

type SurfaceStatus = "activating" | "loading" | "ready" | "unresponsive" | "crashed" | "error";
type Bounds = { x: number; y: number; width: number; height: number };

const APPEARANCE_ATTRIBUTES = [
  "data-interface-style",
  "data-interface-style-family",
  "data-interface-style-variant",
  "data-interface-style-palette",
  "data-sub-theme-id",
  "data-text-size",
] as const;

const APPEARANCE_VARIABLES = [
  "--po-canvas",
  "--po-surface-editor",
  "--po-editor-bg",
  "--po-panel",
  "--po-panel-raised",
  "--po-text",
  "--po-text-muted",
  "--po-text-subtle",
  "--po-danger",
  "--po-border",
  "--po-border-subtle",
  "--po-divider",
  "--po-focus-ring",
  "--po-scrollbar-thumb",
  "--po-scrollbar-thumb-hover",
  "--po-font-sans",
  "--po-font-mono",
  "--po-text-size-body",
  "--po-line-height-body",
] as const;

export function BuiltInEditorSurfaceController({
  viewer,
  context,
}: {
  viewer: PresetViewerContribution;
  context: PresetViewerRenderContext;
}) {
  const { direction, t } = useLocalization();
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<SurfaceStatus>("activating");
  const [error, setError] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [safeMode, setSafeMode] = useState(false);
  const bridge = window.puppyoneDesktop?.editorSurfaces ?? null;

  const measureBounds = useCallback((): Bounds | null => {
    const rectangle = hostRef.current?.getBoundingClientRect();
    if (!rectangle) return null;
    return {
      x: Math.max(0, Math.round(rectangle.left)),
      y: Math.max(0, Math.round(rectangle.top)),
      width: Math.max(1, Math.round(rectangle.width)),
      height: Math.max(1, Math.round(rectangle.height)),
    };
  }, []);

  const collectAppearance = useCallback(() => {
    const root = document.documentElement;
    const surface = hostRef.current?.closest(".po-viewer-surface-boundary") ?? root;
    const computed = getComputedStyle(surface);
    return {
      dark: root.classList.contains("dark"),
      direction: direction === "rtl" ? "rtl" as const : "ltr" as const,
      attributes: Object.fromEntries(APPEARANCE_ATTRIBUTES.flatMap((name) => {
        const value = root.getAttribute(name);
        return value == null ? [] : [[name, value]];
      })),
      variables: Object.fromEntries(APPEARANCE_VARIABLES.flatMap((name) => {
        const value = computed.getPropertyValue(name).trim();
        return value ? [[name, value]] : [];
      })),
    };
  }, [direction]);

  useEffect(() => {
    if (!bridge?.onState) return undefined;
    return bridge.onState((event) => {
      if (event.sessionId !== sessionIdRef.current) return;
      if (event.status === "ready") {
        setStatus("ready");
        setError(null);
      } else if (
        event.status === "unresponsive"
        || event.status === "crashed"
        || event.status === "error"
      ) {
        setStatus(event.status);
        setError(event.message ?? event.reason ?? null);
      } else if (event.status === "loading") {
        setStatus("loading");
      }
    });
  }, [bridge]);

  useEffect(() => {
    if (!bridge || !context.fileUrl) return undefined;
    let cancelled = false;
    const bounds = measureBounds() ?? { x: 0, y: 0, width: 640, height: 480 };
    setStatus("activating");
    setError(null);

    void bridge.activate({
      viewerId: viewer.id,
      documentPath: context.document.path,
      documentRevision: context.document.version ?? null,
      resourceUrl: context.fileUrl,
      title: context.document.name,
      safeMode,
      bounds,
      appearance: collectAppearance(),
    }).then(async (session) => {
      if (cancelled) {
        await bridge.destroy({ sessionId: session.sessionId });
        return;
      }
      sessionIdRef.current = session.sessionId;
      setStatus(session.status === "ready" ? "ready" : "loading");
      const currentBounds = measureBounds();
      if (currentBounds) await bridge.setBounds({ sessionId: session.sessionId, bounds: currentBounds });
    }).catch((reason) => {
      if (cancelled) return;
      setStatus("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      cancelled = true;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) void bridge.destroy({ sessionId }).catch(() => undefined);
    };
  }, [
    bridge,
    collectAppearance,
    context.document.name,
    context.document.path,
    context.document.version,
    context.fileUrl,
    measureBounds,
    retryGeneration,
    safeMode,
    viewer.id,
  ]);

  useEffect(() => {
    if (!bridge) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    let frame: number | null = null;
    const publishBounds = () => {
      frame = null;
      const sessionId = sessionIdRef.current;
      const bounds = measureBounds();
      if (sessionId && bounds) void bridge.setBounds({ sessionId, bounds });
    };
    const scheduleBounds = () => {
      if (frame === null) frame = requestAnimationFrame(publishBounds);
    };
    const observer = new ResizeObserver(scheduleBounds);
    observer.observe(host);
    window.addEventListener("resize", scheduleBounds);
    window.addEventListener("scroll", scheduleBounds, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBounds);
      window.removeEventListener("scroll", scheduleBounds, true);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [bridge, measureBounds]);

  useEffect(() => {
    if (!bridge) return undefined;
    const observer = new MutationObserver(() => {
      const sessionId = sessionIdRef.current;
      if (sessionId) {
        void bridge.updateAppearance({ sessionId, appearance: collectAppearance() });
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", ...APPEARANCE_ATTRIBUTES],
    });
    return () => observer.disconnect();
  }, [bridge, collectAppearance]);

  if (context.fileUrlLoading) {
    return (
      <div className="built-in-editor-surface-state" aria-busy="true">
        <PageLoading variant="fill" label={null} ariaLabel={t("editor.loadingFile")} />
      </div>
    );
  }

  if (!context.fileUrl) {
    return (
      <div className="built-in-editor-surface-state built-in-editor-surface-state--failed" role="alert">
        <strong>{t("editor.unavailable.title")}</strong>
        {context.fileUrlError ? <span dir="auto">{context.fileUrlError}</span> : null}
        {context.openExternalFile ? (
          <div className="built-in-editor-surface-actions">
            <button type="button" onClick={() => void context.openExternalFile?.(context.document.path)}>
              {t("editor.openDefaultApp")}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const failed = status === "crashed" || status === "error" || status === "unresponsive";
  return (
    <div
      className="built-in-editor-surface"
      data-preview-state={status === "ready" ? "ready" : "loading"}
      data-surface-status={status}
      data-safe-mode={safeMode ? "true" : undefined}
      aria-busy={status !== "ready"}
    >
      <div ref={hostRef} className="built-in-editor-surface-host" />
      {(status === "activating" || status === "loading") && (
        <div className="built-in-editor-surface-state">
          <PageLoading variant="fill" label={null} ariaLabel={t("editor.loadingViewer")} />
        </div>
      )}
      {failed && (
        <div className="built-in-editor-surface-state built-in-editor-surface-state--failed" role="alert">
          <strong>{t("shared-ui.preview.crashed")}</strong>
          {error ? <span dir="auto">{error}</span> : null}
          <div className="built-in-editor-surface-actions">
            <button
              type="button"
              onClick={() => {
                setSafeMode(viewer.recoveryPolicy.supportsSafeMode);
                setRetryGeneration((current) => current + 1);
              }}
            >
              {t("common.action.retry")}
            </button>
            {context.openExternalFile ? (
              <button type="button" onClick={() => void context.openExternalFile?.(context.document.path)}>
                {t("editor.openDefaultApp")}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

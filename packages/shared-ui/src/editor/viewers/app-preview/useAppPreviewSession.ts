import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  AppPreviewActivationResult,
  AppPreviewBounds,
  AppPreviewController,
  AppPreviewResult,
  AppPreviewSurfaceCommand,
  AppPreviewSurfaceState,
} from "../../../core/types";
import type { AppPreviewMode, AppPreviewViewState } from "./types";

type ActivationIntent = "start" | "restart";

export function useAppPreviewSession({
  appPreview,
  path,
  mode,
  hostRef,
  enabled = true,
  surfaceVisible = true,
}: {
  appPreview: AppPreviewController | null | undefined;
  path: string;
  mode: AppPreviewMode;
  hostRef: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  surfaceVisible?: boolean;
}) {
  const [state, setState] = useState<AppPreviewViewState>({
    status: "idle",
    runtime: null,
    surface: null,
    error: null,
  });
  const [logs, setLogs] = useState("");
  const [activationVersion, setActivationVersion] = useState(0);
  const nextIntentRef = useRef<ActivationIntent>("start");
  const requestVersionRef = useRef(0);
  const activeAttachmentRef = useRef<string | null>(null);
  const surfaceRef = useRef<AppPreviewSurfaceState | null>(null);
  const surfaceVisibleRef = useRef(surfaceVisible);
  const scheduleBoundsSyncRef = useRef<() => void>(() => undefined);
  const runtimeGenerationRef = useRef(0);
  const runtimeIdRef = useRef<string | null>(null);
  const runtimeSequenceRef = useRef(new Map<string, number>());
  const surfaceSequenceRef = useRef(new Map<string, number>());
  const nativeSurface = Boolean(appPreview?.activate && appPreview?.detachSurface);

  const refreshLogs = useCallback(async () => {
    if (!appPreview?.getLogs) return;
    try {
      setLogs(await appPreview.getLogs(path));
    } catch (error) {
      setLogs(sanitizePreviewTransportError(error instanceof Error ? error.message : String(error)));
    }
  }, [appPreview, path]);

  const requestActivation = useCallback((intent: ActivationIntent) => {
    nextIntentRef.current = intent;
    setActivationVersion((value) => value + 1);
  }, []);

  const stop = useCallback(async () => {
    if (!appPreview?.stop) return;
    requestVersionRef.current += 1;
    try {
      const runtime = await appPreview.stop(path);
      surfaceRef.current = null;
      setState({ status: "stopped", runtime, surface: null, error: null });
      setLogs(runtime.logs ?? "");
    } catch (error) {
      setState((current) => ({
        ...current,
        status: "error",
        error: {
          code: "start-failed",
          detail: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }, [appPreview, path]);

  const runSurfaceCommand = useCallback((command: AppPreviewSurfaceCommand) => {
    const surfaceId = surfaceRef.current?.surfaceId;
    if (!surfaceId || !appPreview?.runSurfaceCommand) return;
    void appPreview.runSurfaceCommand({ surfaceId, command });
  }, [appPreview]);

  useEffect(() => {
    if (enabled && mode === "logs") void refreshLogs();
  }, [enabled, mode, refreshLogs]);

  useEffect(() => {
    runtimeGenerationRef.current = 0;
    runtimeIdRef.current = null;
    runtimeSequenceRef.current.clear();
    surfaceSequenceRef.current.clear();
    surfaceRef.current = null;
    if (!enabled) {
      requestVersionRef.current += 1;
      setLogs("");
      setState({ status: "idle", runtime: null, surface: null, error: null });
    }
  }, [enabled, path]);

  useEffect(() => {
    if (!enabled || !appPreview?.subscribeRuntime) return;
    return appPreview.subscribeRuntime((runtime) => {
      if (runtime.path !== path) return;
      const generation = runtime.generation ?? 0;
      const runtimeId = runtime.runtimeId ?? `generation:${generation}`;
      const sequence = runtime.sequence ?? 0;
      if (generation < runtimeGenerationRef.current) return;
      if (sequence <= (runtimeSequenceRef.current.get(runtimeId) ?? -1)) return;
      if (generation === runtimeGenerationRef.current && runtimeIdRef.current && runtimeIdRef.current !== runtimeId) return;
      runtimeGenerationRef.current = generation;
      runtimeIdRef.current = runtime.runtimeId ?? null;
      runtimeSequenceRef.current.set(runtimeId, sequence);
      setLogs(runtime.logs ?? "");
      setState((current) => ({
        ...current,
        status: runtime.status,
        runtime,
        error: runtime.status === "error"
          ? { code: "start-failed", detail: runtime.message ?? null }
          : null,
      }));
    });
  }, [appPreview, enabled, path]);

  useEffect(() => {
    if (!enabled || !appPreview?.subscribeSurface) return;
    return appPreview.subscribeSurface((surface) => {
      if (surface.path !== path) return;
      const generation = surface.generation ?? 0;
      const sequence = surface.sequence ?? 0;
      if (generation < runtimeGenerationRef.current) return;
      if (runtimeIdRef.current && surface.runtimeId !== runtimeIdRef.current) return;
      if (sequence <= (surfaceSequenceRef.current.get(surface.surfaceId) ?? -1)) return;
      surfaceSequenceRef.current.set(surface.surfaceId, sequence);
      const currentSurfaceId = surfaceRef.current?.surfaceId;
      if (currentSurfaceId && currentSurfaceId !== surface.surfaceId) return;
      if (surface.status === "destroyed") {
        surfaceRef.current = null;
        setState((current) => current.status === "running"
          ? {
            ...current,
            status: "error",
            surface: null,
            error: { code: "start-failed", detail: null },
          }
          : { ...current, surface: null });
        return;
      }
      surfaceRef.current = surface;
      setState((current) => ({
        ...current,
        status: surface.status === "error" ? "error" : current.status,
        surface,
        error: surface.status === "error"
          ? { code: "start-failed", detail: surface.message ?? null }
          : current.error,
      }));
    });
  }, [appPreview, enabled, path]);

  useLayoutEffect(() => {
    if (!enabled || mode !== "preview") return;
    if (!appPreview?.start) {
      setState({
        status: "error",
        runtime: null,
        surface: null,
        error: { code: "unavailable", detail: null },
      });
      return;
    }

    const attachmentId = createAttachmentId();
    activeAttachmentRef.current = attachmentId;
    surfaceRef.current = null;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const intent = nextIntentRef.current;
    nextIntentRef.current = "start";
    let disposed = false;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let latestBounds: AppPreviewBounds | null = null;

    const detach = () => {
      void appPreview.detachSurface?.({
        surfaceId: surfaceRef.current?.surfaceId ?? null,
        attachmentId,
      }).catch(() => {});
    };

    const syncBounds = () => {
      animationFrame = 0;
      const element = hostRef.current;
      if (!element) return;
      latestBounds = measureSurfaceBounds(element, surfaceVisibleRef.current);
      const surfaceId = surfaceRef.current?.surfaceId;
      if (!latestBounds || !surfaceId || activeAttachmentRef.current !== attachmentId) return;
      void appPreview.setSurfaceBounds?.({
        surfaceId,
        attachmentId,
        bounds: latestBounds,
      }).catch(() => {});
    };

    const scheduleBoundsSync = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(syncBounds);
    };
    scheduleBoundsSyncRef.current = scheduleBoundsSync;

    const begin = async () => {
      const element = hostRef.current;
      const initialBounds = element ? measureSurfaceBounds(element, surfaceVisibleRef.current) : null;
      if (!initialBounds) {
        animationFrame = window.requestAnimationFrame(() => void begin());
        return;
      }
      latestBounds = initialBounds;
      setState((current) => ({
        ...current,
        status: "starting",
        error: null,
      }));

      try {
        let runtime: AppPreviewResult;
        let surface: AppPreviewSurfaceState | null = null;
        if (nativeSurface && appPreview.activate) {
          const response = intent === "restart" && appPreview.restart
            ? await appPreview.restart(path, { bounds: initialBounds, attachmentId })
            : await appPreview.activate({ path, bounds: initialBounds, attachmentId });
          ({ runtime, surface } = normalizeActivationResult(response));
        } else {
          runtime = intent === "restart" && appPreview.restart
            ? normalizeRuntimeResult(await appPreview.restart(path))
            : await appPreview.start(path);
        }
        if (disposed || requestVersion !== requestVersionRef.current) return;
        runtimeGenerationRef.current = Math.max(runtimeGenerationRef.current, runtime.generation ?? 0);
        runtimeIdRef.current = runtime.runtimeId ?? null;
        if (runtime.runtimeId) runtimeSequenceRef.current.set(runtime.runtimeId, runtime.sequence ?? 0);
        surfaceRef.current = surface;
        setLogs(runtime.logs ?? "");
        setState({
          status: runtime.status === "running" ? "running" : runtime.status,
          runtime,
          surface,
          error: runtime.status === "error"
            ? { code: "start-failed", detail: runtime.message ?? null }
            : null,
        });
        scheduleBoundsSync();
      } catch (error) {
        if (disposed || requestVersion !== requestVersionRef.current) return;
        const detail = error instanceof Error ? error.message : String(error);
        if (/cancel/i.test(detail)) {
          setState((current) => ({ ...current, status: "stopped", error: null }));
          return;
        }
        setState((current) => ({
          ...current,
          status: "error",
          error: {
            code: "start-failed",
            detail,
          },
        }));
        void refreshLogs();
      }
    };

    const host = hostRef.current;
    if (host && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleBoundsSync);
      resizeObserver.observe(host);
    }
    window.addEventListener("resize", scheduleBoundsSync);
    window.addEventListener("scroll", scheduleBoundsSync, true);
    void begin();

    return () => {
      disposed = true;
      requestVersionRef.current += 1;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleBoundsSync);
      window.removeEventListener("scroll", scheduleBoundsSync, true);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      scheduleBoundsSyncRef.current = () => undefined;
      if (activeAttachmentRef.current === attachmentId) activeAttachmentRef.current = null;
      detach();
    };
  }, [activationVersion, appPreview, enabled, hostRef, mode, nativeSurface, path, refreshLogs]);

  useLayoutEffect(() => {
    surfaceVisibleRef.current = surfaceVisible;
    scheduleBoundsSyncRef.current();
  }, [surfaceVisible]);

  return {
    state,
    logs,
    nativeSurface,
    run: () => requestActivation("start"),
    restart: () => requestActivation("restart"),
    stop,
    refreshLogs,
    runSurfaceCommand,
  };
}

function measureSurfaceBounds(element: HTMLElement, visible: boolean): AppPreviewBounds | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: visible ? Math.floor(rect.left) : -100_000,
    y: visible ? Math.floor(rect.top) : -100_000,
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
  };
}

function normalizeActivationResult(
  result: AppPreviewResult | AppPreviewActivationResult,
): AppPreviewActivationResult {
  if ("runtime" in result) return result;
  return { runtime: result, surface: null };
}

function normalizeRuntimeResult(
  result: AppPreviewResult | AppPreviewActivationResult,
): AppPreviewResult {
  return "runtime" in result ? result.runtime : result;
}

function sanitizePreviewTransportError(value: string): string {
  return value
    .replace(/Error invoking remote method[^:]*:\s*/gi, "")
    .replace(/\b(?:ipc|rpc)[\w:-]*\b/gi, "preview service")
    .slice(0, 1_000);
}

let attachmentSequence = 0;

function createAttachmentId() {
  attachmentSequence += 1;
  return `app-attachment-${Date.now().toString(36)}-${attachmentSequence.toString(36)}`;
}

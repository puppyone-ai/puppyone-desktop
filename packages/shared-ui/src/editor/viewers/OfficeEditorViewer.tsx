"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocalization } from "@puppyone/localization/react";
import type { EditorDocument } from "../viewerTypes";
import type {
  OfficeEditingPort,
  OfficeEditingSession,
  OfficeEditingState,
  OfficeEditingSurfaceBounds,
} from "../../core/types";
import { registerActiveOfficeEditingSession } from "../office/activeOfficeEditingSessions";
import { useDocumentSurfaceState } from "../DocumentSurfaceHost";

export function OfficeEditorViewer({
  document,
  officeEditing,
  fallback,
}: {
  document: EditorDocument;
  officeEditing: OfficeEditingPort;
  fallback: ReactNode;
}) {
  const { locale, t } = useLocalization();
  const documentSurfaceState = useDocumentSurfaceState();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sessionStateRef = useRef<OfficeEditingState | null>(null);
  const attachmentIdRef = useRef(createAttachmentId());
  const surfaceVisibleRef = useRef(documentSurfaceState === "committed");
  const scheduleBoundsSyncRef = useRef<() => void>(() => undefined);
  const [session, setSession] = useState<OfficeEditingSession | null>(null);
  const [sessionState, setSessionState] = useState<OfficeEditingState | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [surfaceReady, setSurfaceReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void officeEditing.getAvailability()
      .then((availability) => {
        if (!availability.available) {
          if (!cancelled) setFallbackReason(availability.reason ?? "unavailable");
          return null;
        }
        return officeEditing.createSession({ path: document.path, locale });
      })
      .then((created) => {
        if (!cancelled && created) {
          sessionStateRef.current = created.state;
          setSession(created);
          setSessionState(created.state);
        }
      })
      .catch((error) => {
        if (!cancelled) setFallbackReason(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [document.path, locale, officeEditing]);

  useEffect(() => officeEditing.subscribe((nextState) => {
    if (nextState.sessionId !== session?.sessionId) return;
    sessionStateRef.current = nextState;
    setSessionState(nextState);
    if (nextState.status === "closed") setFallbackReason("closed");
  }), [officeEditing, session?.sessionId]);

  useEffect(() => {
    if (!session) return undefined;
    return registerActiveOfficeEditingSession(session.sessionId, () => forceSaveAndWait({
      officeEditing,
      sessionId: session.sessionId,
      getCurrentState: () => sessionStateRef.current,
    }));
  }, [officeEditing, session]);

  useEffect(() => {
    const host = hostRef.current;
    if (!session || !host || fallbackReason) return undefined;
    let cancelled = false;
    let surfaceId: string | null = null;
    let animationFrame: number | null = null;
    const attachmentId = attachmentIdRef.current;

    const syncBounds = () => {
      if (!surfaceId || cancelled) return;
      void officeEditing.setSurfaceBounds(surfaceId, {
        attachmentId,
        bounds: getSurfaceBounds(host, surfaceVisibleRef.current),
      }).catch(() => undefined);
    };
    const scheduleBoundsSync = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        syncBounds();
      });
    };
    scheduleBoundsSyncRef.current = scheduleBoundsSync;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleBoundsSync);
    resizeObserver?.observe(host);
    window.addEventListener("resize", scheduleBoundsSync);
    window.addEventListener("scroll", scheduleBoundsSync, true);

    void officeEditing.attachSurface(session.sessionId, {
      attachmentId,
      bounds: getSurfaceBounds(host, surfaceVisibleRef.current),
    }).then((result) => {
      if (cancelled) {
        return officeEditing.detachSurface(result.surfaceId, attachmentId);
      }
      surfaceId = result.surfaceId;
      setSurfaceReady(result.attached);
      scheduleBoundsSync();
      return undefined;
    }).catch((error) => {
      if (!cancelled) setFallbackReason(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleBoundsSync);
      window.removeEventListener("scroll", scheduleBoundsSync, true);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      scheduleBoundsSyncRef.current = () => undefined;
      if (surfaceId) void officeEditing.detachSurface(surfaceId, attachmentId).catch(() => undefined);
      void officeEditing.closeSession(session.sessionId).catch(() => undefined);
    };
  }, [fallbackReason, officeEditing, session]);

  useLayoutEffect(() => {
    surfaceVisibleRef.current = documentSurfaceState === "committed";
    scheduleBoundsSyncRef.current();
  }, [documentSurfaceState]);

  if (fallbackReason) return <>{fallback}</>;
  if (!session) return <div className="editor-state" aria-busy="true">{t("editor.office.engineConnecting")}</div>;

  const conflict = sessionState?.status === "conflict";
  return (
    <div className="office-editor-shell" aria-busy={!surfaceReady}>
      <div className="office-editor-toolbar" role="status" aria-live="polite">
        <span>{getStatusLabel(sessionState?.status ?? "ready", t)}</span>
        <button
          type="button"
          disabled={sessionState?.status === "saving" || conflict}
          onClick={() => void officeEditing.forceSave(session.sessionId).catch((error) => {
            setErrorState(error, setSessionState, sessionStateRef);
          })}
        >
          {t("editor.office.saveNow")}
        </button>
      </div>
      {conflict && (
        <div className="office-editor-conflict" role="alert">
          <span>{sessionState.message ?? t("editor.office.conflictMessage")}</span>
          <button
            type="button"
            onClick={() => void resolveConflict(officeEditing, session.sessionId, "keep-edited", setSessionState, sessionStateRef)}
          >
            {t("editor.office.keepEdited")}
          </button>
          <button
            type="button"
            onClick={() => void resolveConflict(officeEditing, session.sessionId, "reload-external", setSessionState, sessionStateRef)}
          >
            {t("editor.office.keepExternal")}
          </button>
        </div>
      )}
      {sessionState?.status === "error" && sessionState.message && (
        <div className="office-editor-error" role="alert">{sessionState.message}</div>
      )}
      <div ref={hostRef} className="office-editor-host">
        {!surfaceReady && <div className="office-editor-loading">{t("editor.office.engineLoading")}</div>}
      </div>
    </div>
  );
}

function getSurfaceBounds(element: HTMLElement, visible: boolean): OfficeEditingSurfaceBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: visible ? Math.max(0, Math.round(rect.left)) : -100_000,
    y: visible ? Math.max(0, Math.round(rect.top)) : -100_000,
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function createAttachmentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `office-attachment-${uuid}` : `office-attachment-${Date.now().toString(36)}`;
}

function setErrorState(
  error: unknown,
  setState: (state: OfficeEditingState) => void,
  stateRef: { current: OfficeEditingState | null },
) {
  const current = stateRef.current;
  if (!current) return;
  const next: OfficeEditingState = {
    ...current,
    status: "error",
    message: error instanceof Error ? error.message : String(error),
    updatedAt: Date.now(),
  };
  stateRef.current = next;
  setState(next);
}

function getStatusLabel(status: OfficeEditingState["status"], t: (id: string) => string): string {
  if (status === "saving") return t("editor.office.statusSaving");
  if (status === "saved") return t("editor.office.statusSaved");
  if (status === "conflict") return t("editor.office.statusConflict");
  if (status === "error") return t("editor.office.statusError");
  return t("editor.office.statusEditing");
}

async function forceSaveAndWait({
  officeEditing,
  sessionId,
  getCurrentState,
}: {
  officeEditing: OfficeEditingPort;
  sessionId: string;
  getCurrentState: () => OfficeEditingState | null;
}): Promise<void> {
  const current = getCurrentState();
  if (current?.status === "conflict" || current?.status === "error") {
    throw new Error(current.message ?? "Office document requires attention before closing.");
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let stop: () => void = () => {};
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      stop();
      error ? reject(error) : resolve();
    };
    stop = officeEditing.subscribe((state) => {
      if (state.sessionId !== sessionId) return;
      if (state.status === "saved") finish();
      if (state.status === "conflict" || state.status === "error") {
        finish(new Error(state.message ?? "Office document could not be saved."));
      }
    });
    timeout = setTimeout(() => finish(new Error("Timed out while saving the Office document.")), 25_000);
    void officeEditing.forceSave(sessionId).catch(finish);
  });
}

async function resolveConflict(
  officeEditing: OfficeEditingPort,
  sessionId: string,
  resolution: "keep-edited" | "reload-external",
  setState: (state: OfficeEditingState) => void,
  stateRef: { current: OfficeEditingState | null },
): Promise<void> {
  try {
    const next = await officeEditing.resolveConflict(sessionId, resolution);
    stateRef.current = next;
    setState(next);
  } catch (error) {
    setErrorState(error, setState, stateRef);
  }
}

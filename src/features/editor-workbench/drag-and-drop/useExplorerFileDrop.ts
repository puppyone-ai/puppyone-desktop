import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  EXPLORER_REFERENCE_DRAG_TYPE,
  parseExplorerReferenceDrag,
  type EditorPaneSplitOptions,
  type EditorSplitDirection,
} from "@puppyone/shared-ui";
import {
  acquireNativeSurfacePointerPassthroughLease,
  createNativeSurfacePointerSessionId,
  type NativeSurfacePointerPassthroughLease,
} from "../../native-surfaces";
import {
  useInteractionTermination,
  type InteractionTerminationReason,
} from "../interactions/useInteractionTermination";
import {
  closestPaneDropEdge,
  paneSplitDefinition,
  type PaneDropIntent,
} from "./paneDropGeometry";

export type EditorFileDropHandler = (
  path: string,
  label: string,
  targetPaneId: string,
  direction: EditorSplitDirection,
  placement: NonNullable<EditorPaneSplitOptions["placement"]>,
) => void;

export type EditorFileDropController = Readonly<{
  dropIntent: PaneDropIntent | null;
  over: (event: DragEvent<HTMLElement>, paneId: string) => void;
  leave: (event: DragEvent<HTMLElement>, paneId: string) => void;
  drop: (event: DragEvent<HTMLElement>, paneId: string) => void;
}>;

type ExplorerFileDropSession = Readonly<{
  id: string;
  nativeLease: NativeSurfacePointerPassthroughLease;
}>;

type ExplorerFileDropPreview = Readonly<{
  intent: PaneDropIntent;
  sessionId: string;
}>;

export function useExplorerFileDrop(
  workspaceId: string,
  onOpenAtPaneEdge: EditorFileDropHandler,
): EditorFileDropController {
  const [preview, setPreview] = useState<ExplorerFileDropPreview | null>(null);
  const sessionRef = useRef<ExplorerFileDropSession | null>(null);

  const beginFileDrag = useCallback((): ExplorerFileDropSession => {
    const current = sessionRef.current;
    if (current) return current;
    const id = createNativeSurfacePointerSessionId("explorer-file-drop");
    const session = {
      id,
      nativeLease: acquireNativeSurfacePointerPassthroughLease("explorer-file-drop", id),
    };
    sessionRef.current = session;
    return session;
  }, []);

  const finishFileDrag = useCallback((reason: InteractionTerminationReason): boolean => {
    const session = sessionRef.current;
    if (!session) return false;
    sessionRef.current = null;
    session.nativeLease.release();
    if (reason !== "unmount") {
      setPreview((current) => current?.sessionId === session.id ? null : current);
    }
    return true;
  }, []);

  useInteractionTermination({
    finish: finishFileDrag,
    includeHtmlDragEvents: true,
  });

  useEffect(() => {
    const start = (event: globalThis.DragEvent) => {
      if (hasExplorerFileDrag(event.dataTransfer)) beginFileDrag();
    };
    window.addEventListener("dragstart", start, true);
    return () => {
      window.removeEventListener("dragstart", start, true);
    };
  }, [beginFileDrag]);

  const over = useCallback((event: DragEvent<HTMLElement>, paneId: string) => {
    if (!hasExplorerFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    const session = beginFileDrag();
    setPreview({
      sessionId: session.id,
      intent: {
        targetPaneId: paneId,
        edge: closestPaneDropEdge(
          event.currentTarget.getBoundingClientRect(),
          event.clientX,
          event.clientY,
        ),
      },
    });
  }, [beginFileDrag]);

  const leave = useCallback((event: DragEvent<HTMLElement>, paneId: string) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setPreview((current) => current?.intent.targetPaneId === paneId ? null : current);
  }, []);

  const drop = useCallback((event: DragEvent<HTMLElement>, paneId: string) => {
    if (!hasExplorerFileDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    const payload = parseExplorerReferenceDrag(
      event.dataTransfer.getData(EXPLORER_REFERENCE_DRAG_TYPE),
    );
    const entry = payload?.workspaceId === workspaceId && payload.entries.length === 1
      ? payload.entries[0]
      : null;
    const edge = closestPaneDropEdge(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );
    finishFileDrag("drop");
    if (!entry || entry.entryType !== "file") return;
    const { direction, placement } = paneSplitDefinition(edge);
    onOpenAtPaneEdge(entry.path, entry.name, paneId, direction, placement);
  }, [finishFileDrag, onOpenAtPaneEdge, workspaceId]);

  const dropIntent = preview?.intent ?? null;
  return useMemo(() => ({ dropIntent, over, leave, drop }), [drop, dropIntent, leave, over]);
}

function hasExplorerFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(
    dataTransfer
    && Array.from(dataTransfer.types ?? []).includes(EXPLORER_REFERENCE_DRAG_TYPE),
  );
}

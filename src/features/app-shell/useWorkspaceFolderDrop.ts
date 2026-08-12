import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type DragEventHandler,
} from "react";

type WorkspaceFolderDropOptions = {
  disabled?: boolean;
  onDropFolder: (folder: File) => void | Promise<void>;
  onInvalidDrop: () => void;
};

export type WorkspaceFolderDropBindings = {
  dragging: boolean;
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
};

/**
 * Owns the single-folder drag contract shared by every project home surface.
 * Native path resolution remains in the preload boundary; the renderer only
 * receives the File object granted by the user's drag gesture.
 */
export function useWorkspaceFolderDrop({
  disabled = false,
  onDropFolder,
  onInvalidDrop,
}: WorkspaceFolderDropOptions): WorkspaceFolderDropBindings {
  const [dragging, setDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setDragging(false);
  }, []);

  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (disabled || !hasFilePayload(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  }, [disabled]);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (disabled || !hasFilePayload(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = isPotentialSingleFolderDrop(event.dataTransfer) ? "copy" : "none";
    setDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!dragging) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }, [dragging]);

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasFilePayload(event.dataTransfer)) return;
    event.preventDefault();
    resetDragState();
    if (disabled) return;

    const folder = resolveSingleDroppedFolder(event.dataTransfer);
    if (!folder) {
      onInvalidDrop();
      return;
    }
    void onDropFolder(folder);
  }, [disabled, onDropFolder, onInvalidDrop, resetDragState]);

  return { dragging, onDragEnter, onDragLeave, onDragOver, onDrop };
}

function hasFilePayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes("Files")
    || dataTransfer.files.length > 0
    || Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

function isPotentialSingleFolderDrop(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.files.length > 1) return false;
  const entries = getFileEntries(dataTransfer);
  return entries.length === 0 || (entries.length === 1 && entries[0]?.isDirectory === true);
}

function resolveSingleDroppedFolder(dataTransfer: DataTransfer): File | null {
  if (dataTransfer.files.length !== 1) return null;
  const folder = dataTransfer.files.item(0);
  if (!folder) return null;

  const entries = getFileEntries(dataTransfer);
  if (entries.length > 0 && (entries.length !== 1 || entries[0]?.isDirectory !== true)) return null;
  return folder;
}

function getFileEntries(dataTransfer: DataTransfer): FileSystemEntry[] {
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);
}

export const PANE_MOVE_PREVIEW_CLASS = "desktop-editor-pane-move-preview";
export const PANE_MOVE_PREVIEW_MAX_WIDTH = 240;
export const PANE_MOVE_PREVIEW_MAX_HEIGHT = 156;
export const PANE_MOVE_PREVIEW_MAX_SCALE = 0.36;

export type PaneMovePreviewSnapshot = Readonly<{
  dataUrl: string;
  width: number;
  height: number;
}>;

export async function capturePaneMovePreview(
  sourcePane: HTMLElement,
): Promise<PaneMovePreviewSnapshot | null> {
  const bridge = window.puppyoneDesktop?.capturePanePreview;
  if (!bridge) return null;

  const content = getPanePreviewContent(sourcePane);
  const rect = content.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  try {
    const snapshot = await bridge({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
    return isPaneMovePreviewSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export function createPaneMovePreview(
  sourcePane: HTMLElement,
  clientX: number,
  clientY: number,
  snapshot?: PaneMovePreviewSnapshot | null,
): HTMLElement {
  const content = getPanePreviewContent(sourcePane);
  const rect = content.getBoundingClientRect();
  const { width, height } = getPaneMovePreviewSize(rect.width, rect.height);

  const doc = sourcePane.ownerDocument;
  const preview = doc.createElement("div");
  preview.className = PANE_MOVE_PREVIEW_CLASS;
  preview.setAttribute("aria-hidden", "true");
  preview.dataset.ready = "false";
  preview.style.width = `${width}px`;
  preview.style.height = `${height}px`;

  getPaneMovePreviewHost(sourcePane).append(preview);
  if (snapshot) applyPaneMovePreviewSnapshot(preview, snapshot);
  movePaneMovePreview(preview, clientX, clientY);
  return preview;
}

export function applyPaneMovePreviewSnapshot(
  preview: HTMLElement,
  snapshot: PaneMovePreviewSnapshot,
): void {
  if (!isPaneMovePreviewSnapshot(snapshot)) return;
  const image = preview.ownerDocument.createElement("img");
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;
  image.src = snapshot.dataUrl;
  preview.replaceChildren(image);
  preview.dataset.ready = "true";
}

export function movePaneMovePreview(
  preview: HTMLElement,
  clientX: number,
  clientY: number,
): void {
  preview.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, 10px)`;
}

export function destroyPaneMovePreview(preview: HTMLElement | null | undefined): void {
  preview?.remove();
}

function getPanePreviewContent(sourcePane: HTMLElement): HTMLElement {
  return sourcePane.querySelector<HTMLElement>(".desktop-editor-pane-content")
    ?? sourcePane;
}

function getPaneMovePreviewHost(sourcePane: HTMLElement): HTMLElement {
  const doc = sourcePane.ownerDocument;
  const overlayRoot = doc.getElementById("desktop-overlay-root");
  if (overlayRoot instanceof HTMLElement) return overlayRoot;
  return sourcePane.closest<HTMLElement>(".app-shell") ?? doc.body;
}

function getPaneMovePreviewSize(width: number, height: number) {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const scale = Math.min(
    PANE_MOVE_PREVIEW_MAX_WIDTH / safeWidth,
    PANE_MOVE_PREVIEW_MAX_HEIGHT / safeHeight,
    PANE_MOVE_PREVIEW_MAX_SCALE,
  );
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function isPaneMovePreviewSnapshot(value: unknown): value is PaneMovePreviewSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PaneMovePreviewSnapshot>;
  return typeof snapshot.dataUrl === "string"
    && snapshot.dataUrl.startsWith("data:image/")
    && Number.isFinite(snapshot.width)
    && Number.isFinite(snapshot.height)
    && snapshot.width! > 0
    && snapshot.height! > 0;
}

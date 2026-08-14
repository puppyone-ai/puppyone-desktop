export const PANE_MOVE_PREVIEW_CLASS = "desktop-editor-pane-move-preview";
export const PANE_MOVE_PREVIEW_MAX_WIDTH = 240;
export const PANE_MOVE_PREVIEW_MAX_HEIGHT = 156;

export function createPaneMovePreview(
  sourcePane: HTMLElement,
  clientX: number,
  clientY: number,
): HTMLElement {
  const content = sourcePane.querySelector<HTMLElement>(".desktop-editor-pane-content")
    ?? sourcePane;
  const rect = content.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  const scale = Math.min(
    PANE_MOVE_PREVIEW_MAX_WIDTH / width,
    PANE_MOVE_PREVIEW_MAX_HEIGHT / height,
    0.36,
  );

  const doc = sourcePane.ownerDocument;
  const preview = doc.createElement("div");
  preview.className = PANE_MOVE_PREVIEW_CLASS;
  preview.setAttribute("aria-hidden", "true");
  preview.style.width = `${width * scale}px`;
  preview.style.height = `${height * scale}px`;

  const frame = doc.createElement("div");
  frame.className = `${PANE_MOVE_PREVIEW_CLASS}-frame`;
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.style.transform = `scale(${scale})`;

  const clone = content.cloneNode(true) as HTMLElement;
  sanitizePaneMovePreviewClone(clone);
  copyScrollPositions(content, clone);
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  frame.append(clone);
  preview.append(frame);
  doc.body.append(preview);
  movePaneMovePreview(preview, clientX, clientY);
  return preview;
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

function sanitizePaneMovePreviewClone(root: HTMLElement) {
  root.querySelector(".desktop-editor-pane-handle-shell")?.remove();
  root.querySelector(".desktop-editor-drop-preview")?.remove();
  root.removeAttribute("id");
  root.removeAttribute("data-editor-pane-id");
  for (const node of root.querySelectorAll("[id], [data-editor-pane-id]")) {
    node.removeAttribute("id");
    node.removeAttribute("data-editor-pane-id");
  }
}

function copyScrollPositions(source: Element, clone: Element) {
  const sourceNodes = [source, ...source.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  const count = Math.min(sourceNodes.length, cloneNodes.length);
  for (let index = 0; index < count; index += 1) {
    const from = sourceNodes[index];
    const to = cloneNodes[index];
    if (!(from instanceof HTMLElement) || !(to instanceof HTMLElement)) continue;
    if (from.scrollTop) to.scrollTop = from.scrollTop;
    if (from.scrollLeft) to.scrollLeft = from.scrollLeft;
  }
}

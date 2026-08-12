let activeGestureCount = 0;
let publishedActive = false;

/**
 * Tells the desktop host to keep an owner-renderer drag alive when the pointer
 * crosses a native WebContentsView. This is deliberately separate from
 * occlusion: resizing must leave native content visible while its bounds track
 * the renderer layout.
 */
export function setNativeSurfacePointerPassthrough(active: boolean): void {
  activeGestureCount = active
    ? activeGestureCount + 1
    : Math.max(0, activeGestureCount - 1);
  const nextActive = activeGestureCount > 0;
  if (publishedActive === nextActive) return;
  const publish = window.puppyoneDesktop?.setNativeSurfacePointerPassthrough;
  if (typeof publish !== "function") return;
  publish({ active: nextActive });
  publishedActive = nextActive;
}

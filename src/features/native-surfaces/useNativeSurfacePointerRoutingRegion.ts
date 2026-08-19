import { useLayoutEffect } from "react";
import type { NativeSurfacePointerPassthroughOwner } from "./nativeSurfacePointerPassthrough";
import { acquireNativeSurfacePointerRoutingRegion } from "./nativeSurfacePointerRoutingRegions";

/** Keeps one overlay sash's viewport rectangle registered with the native host. */
export function useNativeSurfacePointerRoutingRegion(
  owner: NativeSurfacePointerPassthroughOwner,
  element: HTMLElement | null,
): void {
  useLayoutEffect(() => {
    if (!element) return undefined;
    const lease = acquireNativeSurfacePointerRoutingRegion(owner);
    const layoutRoot = element.parentElement;
    let frameId: number | null = null;
    let transitionDepth = 0;

    const measure = () => {
      frameId = null;
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, Math.floor(rect.left));
      const top = Math.max(0, Math.floor(rect.top));
      const right = Math.min(window.innerWidth, Math.ceil(rect.right));
      const bottom = Math.min(window.innerHeight, Math.ceil(rect.bottom));
      if (right <= left || bottom <= top) {
        lease.update(null);
      } else {
        lease.update({ x: left, y: top, width: right - left, height: bottom - top });
      }
      if (transitionDepth > 0) frameId = window.requestAnimationFrame(measure);
    };

    const scheduleMeasure = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(measure);
    };
    const isLayoutTransition = (event: TransitionEvent) => (
      event.target === layoutRoot && event.propertyName === "grid-template-columns"
    );
    const handleTransitionRun = (event: TransitionEvent) => {
      if (!isLayoutTransition(event)) return;
      transitionDepth += 1;
      scheduleMeasure();
    };
    const handleTransitionEnd = (event: TransitionEvent) => {
      if (!isLayoutTransition(event)) return;
      transitionDepth = Math.max(0, transitionDepth - 1);
      scheduleMeasure();
    };

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(scheduleMeasure)
      : null;
    resizeObserver?.observe(element);
    if (layoutRoot) resizeObserver?.observe(layoutRoot);

    const mutationObserver = typeof MutationObserver === "function" && layoutRoot
      ? new MutationObserver(scheduleMeasure)
      : null;
    if (mutationObserver && layoutRoot) {
      mutationObserver.observe(layoutRoot, {
        attributes: true,
        attributeFilter: ["style", "data-explorer-collapsed", "data-explorer-dragging"],
      });
    }

    layoutRoot?.addEventListener("transitionrun", handleTransitionRun);
    layoutRoot?.addEventListener("transitionend", handleTransitionEnd);
    layoutRoot?.addEventListener("transitioncancel", handleTransitionEnd);
    window.addEventListener("resize", scheduleMeasure);
    document.addEventListener("scroll", scheduleMeasure, true);
    measure();

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      layoutRoot?.removeEventListener("transitionrun", handleTransitionRun);
      layoutRoot?.removeEventListener("transitionend", handleTransitionEnd);
      layoutRoot?.removeEventListener("transitioncancel", handleTransitionEnd);
      window.removeEventListener("resize", scheduleMeasure);
      document.removeEventListener("scroll", scheduleMeasure, true);
      lease.release();
    };
  }, [element, owner]);
}

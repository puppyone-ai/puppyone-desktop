import { useLayoutEffect } from "react";

let activeLeaseCount = 0;
let publishedOcclusion = false;
let transitionVersion = 0;

/**
 * Acquires a renderer-local product-chrome lease. Multiple nested menus and
 * dialogs collapse into one owner-scoped IPC state, so native surfaces are
 * restored only after the final overlay closes.
 */
export function acquireNativeSurfaceOcclusionLease(): () => void {
  activeLeaseCount += 1;
  transitionVersion += 1;
  publishOcclusion(true);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLeaseCount = Math.max(0, activeLeaseCount - 1);
    const releaseVersion = ++transitionVersion;
    if (activeLeaseCount !== 0) return;

    // React StrictMode may mount, clean up and immediately remount an effect.
    // Deferring the last release avoids a native-view flash in that gap.
    queueMicrotask(() => {
      if (activeLeaseCount === 0 && transitionVersion === releaseVersion) {
        publishOcclusion(false);
      }
    });
  };
}

export function useNativeSurfaceOcclusionLease(): void {
  useLayoutEffect(() => acquireNativeSurfaceOcclusionLease(), []);
}

/**
 * Covers cross-package and imperative overlays that cannot import the desktop
 * React primitive. Such surfaces opt in with data-native-surface-occluder.
 */
export function useNativeSurfaceOcclusionObserver(): void {
  useLayoutEffect(() => {
    const root = document.body;
    let releaseLease: (() => void) | null = null;
    const synchronize = () => {
      const hasOccluder = Boolean(root.querySelector('[data-native-surface-occluder="true"]'));
      if (hasOccluder && !releaseLease) {
        releaseLease = acquireNativeSurfaceOcclusionLease();
      } else if (!hasOccluder && releaseLease) {
        releaseLease();
        releaseLease = null;
      }
    };
    const observer = new MutationObserver(synchronize);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-native-surface-occluder"],
      childList: true,
      subtree: true,
    });
    synchronize();
    return () => {
      observer.disconnect();
      releaseLease?.();
    };
  }, []);
}

function publishOcclusion(occluded: boolean) {
  if (publishedOcclusion === occluded) return;
  const publish = window.puppyoneDesktop?.setNativeSurfaceOccluded;
  if (typeof publish !== "function") return;
  publish({ occluded });
  publishedOcclusion = occluded;
}

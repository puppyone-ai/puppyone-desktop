/**
 * Coordinates product-chrome occlusion for every native WebContentsView.
 *
 * Electron native child views are composited above the BrowserWindow renderer,
 * so renderer z-index values cannot place menus or dialogs above them. Surface
 * owners register one visibility callback here; the trusted application frame
 * publishes a single owner-scoped occlusion state while product chrome is open.
 */
export function createNativeSurfaceOcclusionCoordinator({
  onCallbackError = () => {},
} = {}) {
  const registrationsByOwner = new Map();
  const occludedOwners = new Set();
  let disposed = false;

  function register({ ownerWebContentsId, setOccluded }) {
    assertOwnerWebContentsId(ownerWebContentsId);
    if (typeof setOccluded !== "function") {
      throw new TypeError("Native surface occlusion callback is required.");
    }
    if (disposed) throw new Error("Native surface occlusion coordinator is disposed.");

    const registration = { setOccluded };
    const registrations = registrationsByOwner.get(ownerWebContentsId) ?? new Set();
    registrations.add(registration);
    registrationsByOwner.set(ownerWebContentsId, registrations);
    notify(registration, occludedOwners.has(ownerWebContentsId));

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = registrationsByOwner.get(ownerWebContentsId);
      current?.delete(registration);
      if (current?.size === 0) registrationsByOwner.delete(ownerWebContentsId);
    };
  }

  function setOwnerOccluded(ownerWebContentsId, occluded) {
    assertOwnerWebContentsId(ownerWebContentsId);
    if (disposed) return false;
    if (typeof occluded !== "boolean") {
      throw new TypeError("Native surface occlusion state must be boolean.");
    }

    const current = occludedOwners.has(ownerWebContentsId);
    if (current === occluded) return false;
    if (occluded) occludedOwners.add(ownerWebContentsId);
    else occludedOwners.delete(ownerWebContentsId);
    notifyOwner(ownerWebContentsId, occluded);
    return true;
  }

  function releaseOwner(ownerWebContentsId) {
    assertOwnerWebContentsId(ownerWebContentsId);
    if (!occludedOwners.delete(ownerWebContentsId)) return false;
    notifyOwner(ownerWebContentsId, false);
    return true;
  }

  function isOwnerOccluded(ownerWebContentsId) {
    assertOwnerWebContentsId(ownerWebContentsId);
    return occludedOwners.has(ownerWebContentsId);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const ownerWebContentsId of Array.from(occludedOwners)) {
      notifyOwner(ownerWebContentsId, false);
    }
    occludedOwners.clear();
    registrationsByOwner.clear();
  }

  function notifyOwner(ownerWebContentsId, occluded) {
    for (const registration of registrationsByOwner.get(ownerWebContentsId) ?? []) {
      notify(registration, occluded);
    }
  }

  function notify(registration, occluded) {
    try {
      registration.setOccluded(occluded);
    } catch (error) {
      try {
        onCallbackError(error);
      } catch {
        // A diagnostic hook must not compromise visibility coordination.
      }
    }
  }

  return Object.freeze({
    register,
    setOwnerOccluded,
    releaseOwner,
    isOwnerOccluded,
    dispose,
  });
}

function assertOwnerWebContentsId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Native surface owner WebContents id must be a positive integer.");
  }
}

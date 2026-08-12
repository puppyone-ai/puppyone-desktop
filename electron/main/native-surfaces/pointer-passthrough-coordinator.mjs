const FORWARDED_MOUSE_TYPES = new Set(["mouseMove", "mouseUp"]);

/**
 * Keeps renderer-owned resize gestures alive across native WebContentsViews.
 *
 * A child view receives OS mouse input before the BrowserWindow renderer. While
 * an owner-scoped drag is active, move/up events are translated back into the
 * owner's content coordinates and delivered to that renderer. The native view
 * remains attached and visible, so its bounds can follow layout changes every
 * animation frame instead of flashing blank for the whole gesture.
 */
export function createNativeSurfacePointerPassthroughCoordinator({
  onForwardError = () => {},
} = {}) {
  const registrationsByOwner = new Map();
  const activeOwners = new Set();
  let disposed = false;

  function register({ ownerWebContentsId, ownerWebContents, surfaceView }) {
    assertOwnerWebContentsId(ownerWebContentsId);
    if (disposed) throw new Error("Native surface pointer passthrough coordinator is disposed.");
    if (!ownerWebContents || typeof ownerWebContents.sendInputEvent !== "function") {
      throw new TypeError("Native surface owner WebContents is required.");
    }
    const surfaceWebContents = surfaceView?.webContents;
    if (
      !surfaceView ||
      typeof surfaceView.getBounds !== "function" ||
      !surfaceWebContents ||
      typeof surfaceWebContents.on !== "function"
    ) {
      throw new TypeError("Native surface WebContentsView is required.");
    }

    const registration = {
      ownerWebContents,
      ownerWebContentsId,
      surfaceView,
      surfaceWebContents,
      handleMouse: null,
    };
    registration.handleMouse = (event, mouse) => {
      if (!activeOwners.has(ownerWebContentsId) || !FORWARDED_MOUSE_TYPES.has(mouse?.type)) return;

      event?.preventDefault?.();
      try {
        const surfaceBounds = surfaceView.getBounds();
        ownerWebContents.sendInputEvent(toOwnerMouseInput(mouse, surfaceBounds));
      } catch (error) {
        try {
          onForwardError(error);
        } catch {
          // Diagnostics must never compromise input cleanup.
        }
      } finally {
        // The renderer also publishes its normal pointerup cleanup. Releasing
        // here is the main-process fail-safe if that renderer disappears.
        if (mouse.type === "mouseUp") activeOwners.delete(ownerWebContentsId);
      }
    };

    const registrations = registrationsByOwner.get(ownerWebContentsId) ?? new Set();
    registrations.add(registration);
    registrationsByOwner.set(ownerWebContentsId, registrations);
    surfaceWebContents.on("before-mouse-event", registration.handleMouse);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      surfaceWebContents.removeListener?.("before-mouse-event", registration.handleMouse);
      const current = registrationsByOwner.get(ownerWebContentsId);
      current?.delete(registration);
      if (current?.size === 0) registrationsByOwner.delete(ownerWebContentsId);
    };
  }

  function setOwnerActive(ownerWebContentsId, active) {
    assertOwnerWebContentsId(ownerWebContentsId);
    if (disposed) return false;
    if (typeof active !== "boolean") {
      throw new TypeError("Native surface pointer passthrough state must be boolean.");
    }
    const current = activeOwners.has(ownerWebContentsId);
    if (current === active) return false;
    if (active) activeOwners.add(ownerWebContentsId);
    else activeOwners.delete(ownerWebContentsId);
    return true;
  }

  function releaseOwner(ownerWebContentsId) {
    assertOwnerWebContentsId(ownerWebContentsId);
    return activeOwners.delete(ownerWebContentsId);
  }

  function isOwnerActive(ownerWebContentsId) {
    assertOwnerWebContentsId(ownerWebContentsId);
    return activeOwners.has(ownerWebContentsId);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    activeOwners.clear();
    for (const registrations of registrationsByOwner.values()) {
      for (const registration of registrations) {
        registration.surfaceWebContents.removeListener?.(
          "before-mouse-event",
          registration.handleMouse,
        );
      }
    }
    registrationsByOwner.clear();
  }

  return Object.freeze({
    register,
    setOwnerActive,
    releaseOwner,
    isOwnerActive,
    dispose,
  });
}

function toOwnerMouseInput(mouse, surfaceBounds) {
  const input = {
    type: mouse.type,
    x: Math.round(surfaceBounds.x + mouse.x),
    y: Math.round(surfaceBounds.y + mouse.y),
  };
  if (mouse.button) input.button = mouse.button;
  else if (mouse.type === "mouseUp") input.button = "left";
  if (Number.isFinite(mouse.clickCount)) input.clickCount = mouse.clickCount;
  if (Number.isFinite(mouse.movementX)) input.movementX = mouse.movementX;
  if (Number.isFinite(mouse.movementY)) input.movementY = mouse.movementY;
  if (Array.isArray(mouse.modifiers)) input.modifiers = [...mouse.modifiers];
  return input;
}

function assertOwnerWebContentsId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Native surface owner WebContents id must be a positive integer.");
  }
}

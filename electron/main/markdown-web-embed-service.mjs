import { WebContentsView, session as electronSession } from "electron";
import { randomUUID } from "node:crypto";
import {
  assertMarkdownWebEmbedHref,
  assertMarkdownWebEmbedNetworkTarget,
} from "./markdown-web-embed-policy.mjs";

const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_EMBEDS_PER_OWNER = 8;
const DEFAULT_MAX_EMBEDS_TOTAL = 32;

/**
 * Main-process Markdown web-embed service.
 *
 * Every view is bound to one live owner WebContents, one temporary Session and
 * one clipped region inside the owner's content viewport. The renderer can ask
 * for a position, but it cannot create an unbounded native overlay or load a
 * non-public network target.
 */
export function createMarkdownWebEmbedService({
  getOwnerWindow,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  maxEmbedsPerOwner = DEFAULT_MAX_EMBEDS_PER_OWNER,
  maxEmbedsTotal = DEFAULT_MAX_EMBEDS_TOTAL,
  resolveHost = null,
}) {
  if (typeof getOwnerWindow !== "function") {
    throw new TypeError("Markdown web embed owner resolver is required.");
  }
  if (!Number.isFinite(loadTimeoutMs) || loadTimeoutMs <= 0) {
    throw new TypeError("Markdown web embed load timeout must be positive.");
  }
  if (!Number.isSafeInteger(maxEmbedsPerOwner) || maxEmbedsPerOwner <= 0) {
    throw new TypeError("Markdown web embed per-owner limit must be a positive integer.");
  }
  if (!Number.isSafeInteger(maxEmbedsTotal) || maxEmbedsTotal < maxEmbedsPerOwner) {
    throw new TypeError("Markdown web embed global limit must cover the per-owner limit.");
  }

  const embeds = new Map();
  const owners = new Map();
  const invalidOwnerWebContents = new WeakSet();
  const pendingByOwner = new Map();
  let pendingTotal = 0;
  let disposed = false;

  const generateId = () => `md-web-embed-${randomUUID()}`;

  function destroyEmbed(id, callerWebContentsId = null) {
    const embed = embeds.get(id);
    if (!embed) return false;

    if (
      callerWebContentsId !== null &&
      (!isValidWebContentsId(callerWebContentsId) || embed.ownerWebContentsId !== callerWebContentsId)
    ) {
      return false;
    }

    embeds.delete(id);
    const ownerState = owners.get(embed.ownerWebContentsId);
    ownerState?.embedIds.delete(id);

    try {
      embed.view.setVisible?.(false);
    } catch {
      // Ignore native-view teardown races.
    }
    try {
      if (embed.attached && embed.window && !embed.window.isDestroyed?.()) {
        embed.window.contentView?.removeChildView?.(embed.view);
      }
    } catch {
      // Ignore detach races.
    }
    try {
      if (!embed.view.webContents?.isDestroyed?.()) embed.view.webContents?.destroy?.();
    } catch {
      // Ignore renderer teardown races.
    }
    try {
      cleanupPartitionSession(embed.partitionSession);
    } catch {
      // Ignore ephemeral-session cleanup races.
    }

    if (ownerState && ownerState.embedIds.size === 0) releaseOwnerState(ownerState);
    return true;
  }

  function destroyOwner(ownerWebContentsId) {
    const ownerState = owners.get(ownerWebContentsId);
    if (!ownerState) return;
    if (ownerState.window?.webContents) invalidOwnerWebContents.add(ownerState.window.webContents);
    for (const id of Array.from(ownerState.embedIds)) destroyEmbed(id, null);
    releaseOwnerState(ownerState);
  }

  function releaseOwnerState(ownerState) {
    if (!owners.has(ownerState.ownerWebContentsId)) return;
    owners.delete(ownerState.ownerWebContentsId);
    for (const [emitter, eventName, listener] of ownerState.listeners) {
      try {
        emitter.removeListener?.(eventName, listener);
      } catch {
        // Ignore owner teardown races.
      }
    }
    ownerState.listeners.length = 0;
  }

  function ensureOwnerState(window, ownerWebContentsId) {
    const existing = owners.get(ownerWebContentsId);
    if (existing) {
      if (existing.window !== window) throw new Error("Markdown web embed owner window changed unexpectedly.");
      return existing;
    }

    const state = {
      ownerWebContentsId,
      window,
      embedIds: new Set(),
      listeners: [],
    };
    owners.set(ownerWebContentsId, state);

    const listen = (emitter, eventName, listener) => {
      if (typeof emitter?.on !== "function") return;
      emitter.on(eventName, listener);
      state.listeners.push([emitter, eventName, listener]);
    };
    const closeOwner = () => destroyOwner(ownerWebContentsId);
    const hideOwner = () => {
      for (const id of state.embedIds) {
        const embed = embeds.get(id);
        if (!embed) continue;
        embed.visible = false;
        try {
          embed.view.setVisible?.(false);
        } catch {
          // Ignore native-view visibility races.
        }
      }
    };
    const syncOwnerBounds = () => {
      for (const id of state.embedIds) {
        const embed = embeds.get(id);
        if (embed) applyEmbedBounds(embed);
      }
    };

    listen(window, "closed", closeOwner);
    listen(window, "hide", hideOwner);
    listen(window, "minimize", hideOwner);
    listen(window, "resize", syncOwnerBounds);
    listen(window, "show", syncOwnerBounds);
    listen(window, "restore", syncOwnerBounds);
    listen(window.webContents, "destroyed", closeOwner);
    listen(window.webContents, "render-process-gone", closeOwner);
    listen(window.webContents, "unresponsive", closeOwner);
    return state;
  }

  function requireOwnerWindow(ownerWebContentsId) {
    if (!isValidWebContentsId(ownerWebContentsId)) {
      throw new Error("Markdown web embed owner is invalid.");
    }

    const window = getOwnerWindow(ownerWebContentsId);
    const ownerWebContents = window?.webContents;
    if (
      !window ||
      window.isDestroyed?.() ||
      !ownerWebContents ||
      ownerWebContents.id !== ownerWebContentsId ||
      ownerWebContents.isDestroyed?.() ||
      invalidOwnerWebContents.has(ownerWebContents)
    ) {
      throw new Error("Owner window is unavailable for markdown web embed.");
    }

    getOwnerViewport(window);
    return window;
  }

  function reserveCreateSlot(ownerWebContentsId) {
    const activeForOwner = owners.get(ownerWebContentsId)?.embedIds.size ?? 0;
    const pendingForOwner = pendingByOwner.get(ownerWebContentsId) ?? 0;
    if (
      activeForOwner + pendingForOwner >= maxEmbedsPerOwner ||
      embeds.size + pendingTotal >= maxEmbedsTotal
    ) {
      throw new Error("Markdown web embed session limit reached.");
    }
    pendingByOwner.set(ownerWebContentsId, pendingForOwner + 1);
    pendingTotal += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      pendingTotal = Math.max(0, pendingTotal - 1);
      const remaining = (pendingByOwner.get(ownerWebContentsId) ?? 1) - 1;
      if (remaining <= 0) pendingByOwner.delete(ownerWebContentsId);
      else pendingByOwner.set(ownerWebContentsId, remaining);
    };
  }

  function applyEmbedBounds(embed) {
    let clipped = null;
    try {
      clipped = clipBoundsToOwner(embed.requestedBounds, embed.window);
    } catch {
      clipped = null;
    }

    const ownerVisible =
      !embed.window.isDestroyed?.() &&
      (typeof embed.window.isVisible !== "function" || embed.window.isVisible()) &&
      (typeof embed.window.isMinimized !== "function" || !embed.window.isMinimized());
    const visible = Boolean(clipped && ownerVisible);
    embed.visible = visible;

    try {
      if (clipped) embed.view.setBounds(clipped);
      embed.view.setVisible?.(visible);
      embed.view.webContents?.setAudioMuted?.(!visible);
    } catch {
      return false;
    }
    return visible;
  }

  return {
    async create({ href, bounds, capability, ownerWebContentsId }) {
      if (disposed) throw new Error("Markdown web embed service is disposed.");
      const capabilityScope = assertWebEmbedCapabilityScope(capability);
      const canonicalHref = assertMarkdownWebEmbedHref(href);
      let window = requireOwnerWindow(ownerWebContentsId);
      const requestedBounds = parseRequestedBounds(bounds, { allowHidden: false });
      if (!clipBoundsToOwner(requestedBounds, window)) {
        throw new Error("Markdown web embed bounds are outside the owner viewport.");
      }
      const releaseCreateSlot = reserveCreateSlot(ownerWebContentsId);

      const id = generateId();
      const partition = `temp:md-embed-${id}`;
      let partitionSession = null;
      let view = null;
      let ownerState = null;
      try {
        ownerState = ensureOwnerState(window, ownerWebContentsId);
        partitionSession = electronSession.fromPartition(partition, { cache: false });
        const sessionResolveHost = typeof resolveHost === "function"
          ? resolveHost
          : partitionSession.resolveHost?.bind(partitionSession);
        configureSessionPolicy(partitionSession);
        await assertMarkdownWebEmbedNetworkTarget(canonicalHref, sessionResolveHost);

        // DNS resolution is asynchronous. Re-resolve and strictly compare the
        // owner before attaching a native child view; never use a focused-window
        // fallback supplied by the host.
        window = requireOwnerWindow(ownerWebContentsId);
        view = new WebContentsView({
          webPreferences: {
            session: partitionSession,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            webviewTag: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: false,
            disableDialogs: true,
            safeDialogs: true,
            navigateOnDragDrop: false,
            autoplayPolicy: "document-user-activation-required",
            spellcheck: false,
          },
        });

        const initialOrigin = new URL(canonicalHref).origin;
        installWebContentsPolicy(view.webContents, initialOrigin, () => destroyEmbed(id, null));
        installRequestPolicy(partitionSession, initialOrigin, sessionResolveHost);

        const embed = {
          id,
          href: canonicalHref,
          view,
          window,
          partitionSession,
          capability: capabilityScope,
          ownerWebContentsId,
          requestedBounds,
          visible: false,
          attached: false,
        };
        embeds.set(id, embed);
        ownerState.embedIds.add(id);

        window.contentView.addChildView(view);
        embed.attached = true;
        if (!applyEmbedBounds(embed)) {
          throw new Error("Markdown web embed owner is not visible.");
        }
        await loadUrlWithTimeout(view.webContents, canonicalHref, loadTimeoutMs);
        if (!embeds.has(id) || view.webContents.isDestroyed?.()) {
          throw new Error("Markdown web embed was destroyed while loading.");
        }
        return { id, href: canonicalHref, visible: embed.visible };
      } catch (error) {
        if (!destroyEmbed(id, null)) {
          try {
            if (view && !view.webContents?.isDestroyed?.()) view.webContents?.destroy?.();
          } catch {
            // Ignore constructor/setup teardown races.
          }
          cleanupPartitionSession(partitionSession);
        }
        throw error;
      } finally {
        releaseCreateSlot();
        if (
          ownerState &&
          owners.get(ownerWebContentsId) === ownerState &&
          ownerState.embedIds.size === 0 &&
          (pendingByOwner.get(ownerWebContentsId) ?? 0) === 0
        ) {
          releaseOwnerState(ownerState);
        }
      }
    },

    setBounds({ id, bounds, callerWebContentsId }) {
      const embed = embeds.get(id);
      if (
        !embed ||
        !isValidWebContentsId(callerWebContentsId) ||
        embed.ownerWebContentsId !== callerWebContentsId
      ) {
        return { ok: false, visible: false };
      }

      let requestedBounds;
      try {
        requestedBounds = parseRequestedBounds(bounds, { allowHidden: true });
      } catch {
        return { ok: false, visible: embed.visible };
      }
      embed.requestedBounds = requestedBounds;
      return { ok: true, visible: applyEmbedBounds(embed) };
    },

    destroy({ id, callerWebContentsId }) {
      return { ok: destroyEmbed(id, callerWebContentsId) };
    },

    destroyOwner,

    destroyAll() {
      for (const id of Array.from(embeds.keys())) destroyEmbed(id, null);
      for (const ownerState of Array.from(owners.values())) releaseOwnerState(ownerState);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of Array.from(embeds.keys())) destroyEmbed(id, null);
      for (const ownerState of Array.from(owners.values())) releaseOwnerState(ownerState);
    },
  };
}

function configureSessionPolicy(partitionSession) {
  partitionSession.setPermissionRequestHandler?.((_webContents, _permission, callback) => callback(false));
  partitionSession.setPermissionCheckHandler?.(() => false);
  partitionSession.on?.("will-download", (event) => event.preventDefault());
}

function cleanupPartitionSession(partitionSession) {
  try {
    void partitionSession?.closeAllConnections?.().catch?.(() => undefined);
    void partitionSession?.clearStorageData?.().catch?.(() => undefined);
  } catch {
    // Ignore ephemeral-session cleanup races.
  }
}

function assertWebEmbedCapabilityScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.purpose !== "web-embed") {
    throw new Error("Markdown web embed requires a web-embed capability scope.");
  }
  for (const field of ["editorViewId", "workspaceId", "documentPath", "documentRevision"]) {
    if (typeof value[field] !== "string" || value[field].length === 0 || value[field].length > 4096) {
      throw new Error(`Markdown web embed capability ${field} is invalid.`);
    }
  }
  if (
    value.executionSessionId !== undefined &&
    (typeof value.executionSessionId !== "string" ||
      value.executionSessionId.length === 0 ||
      value.executionSessionId.length > 512)
  ) {
    throw new Error("Markdown web embed capability executionSessionId is invalid.");
  }
  return Object.freeze({
    editorViewId: value.editorViewId,
    workspaceId: value.workspaceId,
    documentPath: value.documentPath,
    documentRevision: value.documentRevision,
    purpose: "web-embed",
    ...(value.executionSessionId ? { executionSessionId: value.executionSessionId } : {}),
  });
}

function installWebContentsPolicy(webContents, initialOrigin, destroy) {
  webContents.setWindowOpenHandler?.(() => ({ action: "deny" }));
  webContents.on?.("will-navigate", (event, url) => {
    if (!isAllowedTopLevelNavigation(url, initialOrigin)) event.preventDefault();
  });
  webContents.on?.("will-redirect", (event, url) => {
    if (!isAllowedTopLevelNavigation(url, initialOrigin)) event.preventDefault();
  });
  webContents.on?.("login", (event) => event.preventDefault());
  webContents.on?.("render-process-gone", destroy);
  webContents.on?.("unresponsive", destroy);
}

function installRequestPolicy(partitionSession, initialOrigin, resolveHost) {
  partitionSession.webRequest?.onBeforeRequest?.((details, callback) => {
    const finish = (result) => {
      try {
        callback(result);
      } catch {
        // The request may already have been cancelled by Session teardown.
      }
    };
    void isAllowedNetworkRequest(details, initialOrigin, resolveHost)
      .then(
        (allowed) => finish(allowed ? {} : { cancel: true }),
        () => finish({ cancel: true }),
      );
  });
}

async function isAllowedNetworkRequest(details, initialOrigin, resolveHost) {
  const canonicalHref = assertMarkdownWebEmbedHref(details?.url);
  if (details?.resourceType === "mainFrame" && new URL(canonicalHref).origin !== initialOrigin) {
    return false;
  }
  await assertMarkdownWebEmbedNetworkTarget(canonicalHref, resolveHost);
  return true;
}

function isAllowedTopLevelNavigation(href, initialOrigin) {
  try {
    const canonicalHref = assertMarkdownWebEmbedHref(href);
    return new URL(canonicalHref).origin === initialOrigin;
  } catch {
    return false;
  }
}

async function loadUrlWithTimeout(webContents, href, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        webContents.stop?.();
      } catch {
        // Ignore stop races; caller destroys the WebContents in its finally path.
      }
      reject(new Error("Markdown web embed load timed out."));
    }, timeoutMs);
  });

  try {
    await Promise.race([Promise.resolve(webContents.loadURL(href)), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseRequestedBounds(bounds, { allowHidden }) {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    throw new Error("Markdown web embed bounds are required.");
  }

  if ([bounds.x, bounds.y, bounds.width, bounds.height].some((value) => typeof value !== "number")) {
    throw new Error("Markdown web embed bounds must be numeric.");
  }
  const { x, y, width, height } = bounds;
  if (![x, y, width, height].every(Number.isFinite)) {
    throw new Error("Markdown web embed bounds must be finite numbers.");
  }
  if (width < 0 || height < 0 || (!allowHidden && (width === 0 || height === 0))) {
    throw new Error("Markdown web embed bounds have an invalid size.");
  }

  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

function clipBoundsToOwner(bounds, window) {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const viewport = getOwnerViewport(window);
  const left = Math.max(0, bounds.x);
  const top = Math.max(0, bounds.y);
  const right = Math.min(viewport.width, bounds.x + bounds.width);
  const bottom = Math.min(viewport.height, bounds.y + bounds.height);
  if (right <= left || bottom <= top) return null;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function getOwnerViewport(window) {
  let width;
  let height;

  const contentBounds = window.getContentBounds?.();
  if (contentBounds && typeof contentBounds === "object") {
    width = Number(contentBounds.width);
    height = Number(contentBounds.height);
  }
  if ((!Number.isFinite(width) || !Number.isFinite(height)) && typeof window.getContentSize === "function") {
    const contentSize = window.getContentSize();
    width = Number(contentSize?.[0]);
    height = Number(contentSize?.[1]);
  }
  if ((!Number.isFinite(width) || !Number.isFinite(height)) && typeof window.contentView?.getBounds === "function") {
    const rootBounds = window.contentView.getBounds();
    width = Number(rootBounds?.width);
    height = Number(rootBounds?.height);
  }

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Markdown web embed owner viewport is unavailable.");
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

function isValidWebContentsId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

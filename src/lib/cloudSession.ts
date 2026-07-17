import {
  getDesktopCloudApiBaseUrl,
  type DesktopCloudSession,
} from "./cloudApi";
import { resolveCloudApiBaseUrl } from "../../shared/cloudEndpoint.js";
import { activateCloudCacheSession } from "../features/cloud/cache/cloudCache";

export type { DesktopCloudSession } from "./cloudApi";

export type DesktopCloudAuthState = {
  status: DesktopCloudSession["status"];
  session: DesktopCloudSession | null;
};

let cachedCloudSession: DesktopCloudSession | null | undefined;
let cachedCloudAuthState: DesktopCloudAuthState | undefined;

export function getCachedDesktopCloudSession(): DesktopCloudSession | null {
  return cachedCloudSession ?? null;
}

export function getCachedDesktopCloudAuthState(): DesktopCloudAuthState | null {
  return cachedCloudAuthState ?? null;
}

export async function readDesktopCloudAuthState(): Promise<DesktopCloudAuthState> {
  const bridge = typeof window !== "undefined" ? window.puppyoneDesktop : undefined;
  if (!bridge || typeof bridge.readCloudAuthState !== "function") {
    return {
      status: cachedCloudSession ? cachedCloudSession.status : "signed-out",
      session: cachedCloudSession ?? null,
    };
  }
  const normalized = normalizeCloudAuthState(await bridge.readCloudAuthState());
  cachedCloudAuthState = normalized;
  cachedCloudSession = normalized.session;
  activateCloudCacheSession(normalized.session);
  return normalized;
}

export async function restoreDesktopCloudSession(apiBaseUrl?: string | null): Promise<DesktopCloudSession | null> {
  const requestedApiBase = normalizeOptionalSessionApiBase(apiBaseUrl);
  if (cachedCloudSession !== undefined && isSessionForApiBase(cachedCloudSession, requestedApiBase)) {
    return cachedCloudSession;
  }
  if (!hasFreshCloudSessionBridge()) {
    if (cachedCloudSession === undefined) cachedCloudSession = null;
    return null;
  }

  const session = normalizeCloudSession(await window.puppyoneDesktop?.restoreCloudSession({
    apiBaseUrl: requestedApiBase,
  }));
  if (session || cachedCloudSession === undefined || isSessionForApiBase(cachedCloudSession, requestedApiBase)) {
    cachedCloudSession = session;
    cachedCloudAuthState = {
      status: session?.status ?? "signed-out",
      session,
    };
    activateCloudCacheSession(session);
  }
  clearLegacyStoredCloudSession();
  return session;
}

export function supportsDesktopCloudOAuth(): boolean {
  return typeof window !== "undefined" && typeof window.puppyoneDesktop?.startCloudOAuth === "function";
}

export async function startDesktopCloudOAuth(
  providerOrApiBaseUrl?: "google" | "github" | string | null,
  apiBaseUrl?: string | null,
): Promise<void> {
  if (!supportsDesktopCloudOAuth()) {
    throw new Error("Desktop OAuth is unavailable.");
  }
  const provider =
    providerOrApiBaseUrl === "google" || providerOrApiBaseUrl === "github"
      ? providerOrApiBaseUrl
      : undefined;
  const requestedApiBaseUrl = provider ? apiBaseUrl : (apiBaseUrl ?? providerOrApiBaseUrl);
  await window.puppyoneDesktop?.startCloudOAuth({
    apiBaseUrl: normalizeSessionApiBase(requestedApiBaseUrl),
    provider,
  });
}

export async function clearDesktopCloudSession(): Promise<void> {
  clearLegacyStoredCloudSession();
  try {
    if (hasDesktopCloudSessionBridge()) {
      await window.puppyoneDesktop?.clearCloudSession();
    }
  } finally {
    // The main process guarantees local sign-out even if remote revocation or
    // credential-file cleanup reports an error. Mirror that guarantee here so
    // renderer memory and account-scoped caches cannot retain the old account.
    cachedCloudSession = null;
    cachedCloudAuthState = { status: "signed-out", session: null };
    activateCloudCacheSession(null);
  }
}

export function onDesktopCloudSessionChanged(
  callback: (session: DesktopCloudSession | null) => void,
): () => void {
  if (!hasDesktopCloudSessionBridge() || typeof window.puppyoneDesktop?.onCloudSessionChanged !== "function") {
    return () => {};
  }

  return window.puppyoneDesktop.onCloudSessionChanged((session) => {
    const normalized = normalizeCloudSession(session);
    cachedCloudSession = normalized;
    activateCloudCacheSession(normalized);
    clearLegacyStoredCloudSession();
    callback(normalized);
  });
}

export function onDesktopCloudAuthStateChanged(
  callback: (state: DesktopCloudAuthState) => void,
): () => void {
  const bridge = typeof window !== "undefined" ? window.puppyoneDesktop : undefined;
  if (!bridge || typeof bridge.onCloudAuthStateChanged !== "function") return () => {};

  return bridge.onCloudAuthStateChanged((state) => {
    const normalized = normalizeCloudAuthState(state);
    cachedCloudAuthState = normalized;
    cachedCloudSession = normalized.session;
    activateCloudCacheSession(normalized.session);
    clearLegacyStoredCloudSession();
    callback(normalized);
  });
}

export function onDesktopCloudAuthError(
  callback: (message: string) => void,
): () => void {
  const bridge = typeof window !== "undefined" ? window.puppyoneDesktop : undefined;
  if (!bridge || typeof bridge.onCloudAuthError !== "function") return () => {};

  return bridge.onCloudAuthError((payload) => {
    callback(typeof payload?.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : "Cloud sign-in failed.");
  });
}

function hasDesktopCloudSessionBridge(): boolean {
  const bridge = typeof window !== "undefined" ? window.puppyoneDesktop : undefined;
  return Boolean(
    bridge &&
      typeof bridge.readCloudSession === "function" &&
      typeof bridge.clearCloudSession === "function",
  );
}

function hasFreshCloudSessionBridge(): boolean {
  const bridge = typeof window !== "undefined" ? window.puppyoneDesktop : undefined;
  return Boolean(
    bridge &&
      typeof bridge.restoreCloudSession === "function",
  );
}

function clearLegacyStoredCloudSession(): void {
  try {
    window.localStorage.removeItem("puppyone.desktop.cloudSession");
    window.localStorage.removeItem("puppyone.desktop.cloudAccountEmail");
  } catch {
    // Best effort cleanup for pre-secure-storage builds.
  }
}

function normalizeCloudSession(session: Partial<DesktopCloudSession> | null | undefined): DesktopCloudSession | null {
  if (!session) return null;
  if (typeof session.user_email !== "string" || !session.user_email.includes("@")) return null;
  if (typeof session.user_id !== "string" || !session.user_id.trim()) return null;
  if (typeof session.session_generation !== "string" || !session.session_generation.trim()) return null;
  return {
    expires_in: typeof session.expires_in === "number" ? session.expires_in : 0,
    expires_at: typeof session.expires_at === "number" ? session.expires_at : 0,
    user_id: session.user_id,
    user_email: session.user_email,
    api_base_url: normalizeSessionApiBase(session.api_base_url),
    session_generation: session.session_generation,
    status: normalizeCloudAuthStatus(session.status),
  };
}

function normalizeCloudAuthState(
  state: { status?: DesktopCloudSession["status"]; session?: Partial<DesktopCloudSession> | null } | null | undefined,
): DesktopCloudAuthState {
  const session = normalizeCloudSession(state?.session);
  return {
    status: state?.status
      ? normalizeCloudAuthStatus(state.status)
      : session?.status ?? "signed-out",
    session,
  };
}

function normalizeCloudAuthStatus(value: DesktopCloudSession["status"] | undefined): DesktopCloudSession["status"] {
  return value === "restoring"
    || value === "signing-in"
    || value === "refreshing"
    || value === "offline-authenticated"
    || value === "signing-out"
    || value === "expired"
    || value === "signed-out"
    ? value
    : "authenticated";
}

function isSessionForApiBase(session: DesktopCloudSession | null | undefined, apiBaseUrl: string | null): boolean {
  if (!session) return false;
  if (!apiBaseUrl) return true;
  return normalizeSessionApiBase(session.api_base_url) === apiBaseUrl;
}

function normalizeOptionalSessionApiBase(apiBaseUrl: string | null | undefined): string | null {
  if (typeof apiBaseUrl === "string" && apiBaseUrl.trim()) {
    return resolveCloudApiBaseUrl(apiBaseUrl);
  }
  return null;
}

function normalizeSessionApiBase(apiBaseUrl: string | null | undefined): string {
  if (typeof apiBaseUrl === "string" && apiBaseUrl.trim()) {
    return resolveCloudApiBaseUrl(apiBaseUrl);
  }
  return getDesktopCloudApiBaseUrl();
}

import {
  getDesktopCloudApiBaseUrl,
  type DesktopCloudSession,
} from "./cloudApi";
import { resolveCloudApiBaseUrl } from "../../shared/cloudEndpoint.js";

export type { DesktopCloudSession } from "./cloudApi";

let cachedCloudSession: DesktopCloudSession | null | undefined;

export function getCachedDesktopCloudSession(): DesktopCloudSession | null {
  return cachedCloudSession ?? null;
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
  }
  clearLegacyStoredCloudSession();
  return session;
}

export function supportsDesktopCloudPasswordSignIn(): boolean {
  return typeof window !== "undefined" && typeof window.puppyoneDesktop?.signInCloudPassword === "function";
}

export async function signInDesktopCloudWithPassword(
  email: string,
  password: string,
  apiBaseUrl?: string | null,
): Promise<DesktopCloudSession | null> {
  if (!supportsDesktopCloudPasswordSignIn()) {
    throw new Error("Desktop password sign-in is unavailable.");
  }
  const session = normalizeCloudSession(await window.puppyoneDesktop?.signInCloudPassword({
    apiBaseUrl: normalizeSessionApiBase(apiBaseUrl),
    email,
    password,
  }));
  if (session) {
    cachedCloudSession = session;
    clearLegacyStoredCloudSession();
  }
  return session;
}

export async function clearDesktopCloudSession(): Promise<void> {
  cachedCloudSession = null;
  clearLegacyStoredCloudSession();
  if (hasDesktopCloudSessionBridge()) {
    await window.puppyoneDesktop?.clearCloudSession();
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
  return {
    expires_in: typeof session.expires_in === "number" ? session.expires_in : 0,
    expires_at: typeof session.expires_at === "number" ? session.expires_at : 0,
    user_email: session.user_email,
    api_base_url: normalizeSessionApiBase(session.api_base_url),
  };
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

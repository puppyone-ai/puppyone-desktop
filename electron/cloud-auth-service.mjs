import { safeStorage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  formatCloudApiHost,
  normalizeCloudApiBaseUrl,
} from "../shared/cloudEndpoint.js";

const DEFAULT_SESSION_STATE_FILENAME = "desktop-cloud-session.json";
const SESSION_REFRESH_SKEW_MS = 60_000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_START_COOLDOWN_MS = 2_000;

export function createCloudAuthService({
  app,
  projectRoot,
  protocol = "puppyone",
  requestCloudApi,
  getWindows,
  revealWindow,
}) {
  const callbackOrigin = `${protocol}://auth`;
  const pendingOAuthStates = new Map();
  const pendingOAuthStarts = new Map();
  const pendingOAuthStartCooldowns = new Set();

  function registerProtocol() {
    try {
      if (process.defaultApp) {
        const appEntry = process.argv[1] ? path.resolve(process.argv[1]) : projectRoot;
        app.setAsDefaultProtocolClient(protocol, process.execPath, [appEntry]);
      } else {
        app.setAsDefaultProtocolClient(protocol);
      }
    } catch (error) {
      console.warn("Unable to register puppyone auth protocol:", error);
    }
  }

  function isCallbackUrl(value) {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return url.protocol === `${protocol}:` && url.hostname === "auth" && url.pathname === "/callback";
    } catch {
      return false;
    }
  }

  async function readSession() {
    return toPublicSession(await readStoredSession());
  }

  async function readStoredSession() {
    try {
      const raw = await fs.promises.readFile(getSessionStatePath(), "utf8");
      const envelope = JSON.parse(raw);
      const session = decryptSessionEnvelope(envelope);
      return normalizeSessionStorageRecord(session);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn("Unable to read puppyone cloud session:", error);
      }
      return null;
    }
  }

  async function restoreSession(apiBase) {
    const session = await restoreStoredSession(apiBase);
    return toPublicSession(session);
  }

  async function restoreStoredSession(apiBase) {
    const session = await readStoredSession();
    if (!session) return null;
    if (!isSessionForApiBase(session, apiBase)) return null;
    if (isFreshSession(session)) return session;

    try {
      return await refreshSession(session, apiBase ?? session.api_base_url);
    } catch (error) {
      if (isAuthFailure(error)) {
        await clearSession();
        return null;
      }
      throw error;
    }
  }

  async function startOAuth({ apiBase, provider }) {
    const normalizedProvider = normalizeOAuthProvider(provider);
    const startKey = getOAuthStartKey(apiBase, normalizedProvider);
    const existing = pendingOAuthStarts.get(startKey);
    if (existing) return existing;

    const request = (async () => {
      const start = await requestCloudApi(apiBase, "/auth/desktop/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: normalizedProvider,
          callback_url: `${callbackOrigin}/callback`,
        }),
      });
      const state = requireNonEmptyString(start?.state, "Cloud sign-in start did not return state.");
      const loginUrl = requireHttpUrl(start?.login_url, "Cloud sign-in start did not return a browser URL.");
      const timeout = setTimeout(() => {
        pendingOAuthStates.delete(state);
      }, OAUTH_STATE_TTL_MS);

      pendingOAuthStates.set(state, {
        apiBase,
        provider: normalizedProvider,
        timeout,
      });

      await shell.openExternal(loginUrl);
      return { ok: true };
    })();

    pendingOAuthStarts.set(startKey, request);
    try {
      return await request;
    } finally {
      const timeout = setTimeout(() => {
        if (pendingOAuthStarts.get(startKey) === request) pendingOAuthStarts.delete(startKey);
        pendingOAuthStartCooldowns.delete(timeout);
      }, OAUTH_START_COOLDOWN_MS);
      pendingOAuthStartCooldowns.add(timeout);
    }
  }

  async function handleCallback(callbackUrl) {
    try {
      const url = new URL(callbackUrl);
      const errorDescription = url.searchParams.get("error_description") || url.searchParams.get("error");
      if (errorDescription) throw new Error(errorDescription);

      const code = requireNonEmptyString(url.searchParams.get("code"), "Cloud sign-in callback is missing a code.");
      // Require the exact CSRF state nonce from the callback — never infer it from
      // "the single pending flow", which would let a forged callback consume an
      // in-flight sign-in (CSRF). No state -> no match -> rejected below.
      const state = url.searchParams.get("state");
      const pending = state ? pendingOAuthStates.get(state) : null;
      if (!pending) throw new Error("Cloud sign-in callback expired. Please sign in again.");
      clearPendingOAuthState(state);

      const data = await requestCloudApi(pending.apiBase, "/auth/desktop/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state }),
      });
      const userEmail = typeof data?.user?.email === "string" ? data.user.email : "";
      const session = buildSessionFromAuth(data, userEmail, "", pending.apiBase);
      await initializeUser(pending.apiBase, session.access_token);
      const storedSession = await writeStoredSession(session);
      revealWindow();
      return toPublicSession(storedSession);
    } catch (error) {
      console.error("Cloud OAuth callback failed:", error);
      broadcastAuthError(error instanceof Error ? error.message : "Cloud sign-in failed.");
      revealWindow();
      return null;
    }
  }

  async function requestSessionApi(apiBase, apiPath, init) {
    const session = await restoreStoredSession(apiBase);
    if (!session) {
      const error = new Error(`Sign in to ${formatCloudApiHost(apiBase)} to load this Cloud workspace.`);
      error.status = 401;
      throw error;
    }

    try {
      return await requestCloudApi(apiBase, apiPath, withSessionHeaders(init, session));
    } catch (error) {
      if (!isAuthFailure(error) || !session.refresh_token) throw error;

      try {
        const refreshed = await refreshSession(session, apiBase);
        return requestCloudApi(apiBase, apiPath, withSessionHeaders(init, refreshed));
      } catch (refreshError) {
        if (isAuthFailure(refreshError)) await clearSession();
        throw error;
      }
    }
  }

  async function writeStoredSession(session) {
    const storageRecord = buildSessionStorageRecord(session);
    if (!storageRecord) throw new Error("Cloud session is invalid.");
    const envelope = encryptSessionEnvelope(storageRecord);
    const filePath = getSessionStatePath();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(envelope, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      await fs.promises.chmod(filePath, 0o600);
    } catch {
      // chmod is best-effort on non-POSIX filesystems.
    }
    broadcastSessionChanged(toPublicSession(storageRecord));
    return storageRecord;
  }

  async function clearSession() {
    await fs.promises.rm(getSessionStatePath(), { force: true });
    broadcastSessionChanged(null);
  }

  function dispose() {
    for (const state of pendingOAuthStates.values()) {
      clearTimeout(state.timeout);
    }
    pendingOAuthStates.clear();
    for (const timeout of pendingOAuthStartCooldowns) {
      clearTimeout(timeout);
    }
    pendingOAuthStartCooldowns.clear();
    pendingOAuthStarts.clear();
  }

  async function refreshSession(session, apiBase) {
    const normalizedApiBase = normalizeCloudApiBaseUrl(apiBase ?? session.api_base_url);
    if (!normalizedApiBase || !session.refresh_token) {
      const error = new Error("Cloud session expired. Please sign in again.");
      error.status = 401;
      throw error;
    }

    const data = await requestCloudApi(normalizedApiBase, "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const refreshed = buildSessionFromAuth(data, session.user_email, session.refresh_token, normalizedApiBase);
    return writeStoredSession(refreshed);
  }

  async function initializeUser(apiBase, accessToken) {
    await requestCloudApi(apiBase, "/auth/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  function getSessionStatePath() {
    return path.join(app.getPath("userData"), DEFAULT_SESSION_STATE_FILENAME);
  }

  function encryptSessionEnvelope(session) {
    const payload = JSON.stringify(session);
    if (safeStorage.isEncryptionAvailable()) {
      return {
        version: 1,
        storage: "electron-safe-storage",
        data: safeStorage.encryptString(payload).toString("base64"),
      };
    }

    if (process.env.PUPPYONE_ALLOW_INSECURE_TOKEN_STORAGE === "1") {
      return {
        version: 1,
        storage: "plaintext-dev",
        data: session,
      };
    }

    throw new Error("Secure credential storage is unavailable on this device.");
  }

  function decryptSessionEnvelope(envelope) {
    if (!envelope || typeof envelope !== "object") return null;
    if (envelope.storage === "electron-safe-storage" && typeof envelope.data === "string") {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Secure credential storage is unavailable on this device.");
      }
      const decrypted = safeStorage.decryptString(Buffer.from(envelope.data, "base64"));
      return JSON.parse(decrypted);
    }

    if (envelope.storage === "plaintext-dev" && process.env.PUPPYONE_ALLOW_INSECURE_TOKEN_STORAGE === "1") {
      return envelope.data;
    }

    return null;
  }

  function buildSessionStorageRecord(session) {
    if (!session || typeof session !== "object") return null;
    const accessToken = typeof session.access_token === "string" ? session.access_token : "";
    const refreshToken = typeof session.refresh_token === "string" ? session.refresh_token : "";
    const userEmail = typeof session.user_email === "string" ? session.user_email : "";
    if (!refreshToken || !userEmail.includes("@")) return null;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number.isFinite(session.expires_in) ? Number(session.expires_in) : 0,
      expires_at: Number.isFinite(session.expires_at) ? Number(session.expires_at) : 0,
      user_email: userEmail,
      api_base_url: normalizeCloudApiBaseUrl(session.api_base_url) ?? undefined,
    };
  }

  function normalizeSessionStorageRecord(session) {
    return buildSessionStorageRecord(session);
  }

  function toPublicSession(session) {
    if (!session) return null;
    return {
      expires_in: Number.isFinite(session.expires_in) ? Number(session.expires_in) : 0,
      expires_at: Number.isFinite(session.expires_at) ? Number(session.expires_at) : 0,
      user_email: session.user_email,
      api_base_url: session.api_base_url,
    };
  }

  function buildSessionFromAuth(data, fallbackEmail, fallbackRefreshToken, apiBase) {
    if (!data || typeof data !== "object") throw new Error("Cloud auth response is invalid.");
    const accessToken = typeof data.access_token === "string" ? data.access_token : "";
    if (!accessToken) throw new Error("Login succeeded but no access token was returned.");
    const refreshToken = typeof data.refresh_token === "string" && data.refresh_token
      ? data.refresh_token
      : fallbackRefreshToken;
    const expiresIn = Number.isFinite(data.expires_in) ? Number(data.expires_in) : 0;
    const userEmail = typeof data.user_email === "string" && data.user_email.includes("@")
      ? data.user_email
      : fallbackEmail;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      expires_at: expiresIn > 0 ? Date.now() + expiresIn * 1000 : 0,
      user_email: userEmail,
      api_base_url: apiBase,
    };
  }

  function isFreshSession(session) {
    return !session.expires_at || Date.now() < session.expires_at - SESSION_REFRESH_SKEW_MS;
  }

  function isSessionForApiBase(session, apiBase) {
    if (!apiBase) return true;
    const sessionApiBase = normalizeCloudApiBaseUrl(session.api_base_url);
    return !sessionApiBase || sessionApiBase === apiBase;
  }

  function withSessionHeaders(init, session) {
    return {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...normalizeRequestHeaders(init?.headers),
        Authorization: `Bearer ${session.access_token}`,
      },
    };
  }

  function clearPendingOAuthState(state) {
    const pending = pendingOAuthStates.get(state);
    if (pending) clearTimeout(pending.timeout);
    pendingOAuthStates.delete(state);
  }

  function getOAuthStartKey(apiBase, provider) {
    return `${apiBase}\n${provider ?? ""}`;
  }

  function broadcastSessionChanged(session) {
    for (const window of getWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send("cloud-session:changed", session);
    }
  }

  function broadcastAuthError(message) {
    for (const window of getWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send("cloud-auth:error", { message });
    }
  }

  return {
    registerProtocol,
    isCallbackUrl,
    handleCallback,
    readSession,
    restoreSession,
    startOAuth,
    requestSessionApi,
    clearSession,
    dispose,
  };
}

function requireNonEmptyString(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function requireHttpUrl(value, message) {
  const raw = requireNonEmptyString(value, message);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(message);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(message);
  }
  return url.toString();
}

function normalizeRequestHeaders(headers) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string" || !key.trim()) continue;
    if (value == null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function normalizeOAuthProvider(provider) {
  if (provider == null || provider === "") return undefined;
  if (provider === "google" || provider === "github") return provider;
  throw new Error("Unsupported Cloud OAuth provider.");
}

function isAuthFailure(error) {
  if (error?.status === 401 || error?.status === 403) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /invalid or expired token|invalid refresh token|refresh token not found|already used|sign in again|sign in to/i.test(message);
}

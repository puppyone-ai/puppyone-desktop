import { randomBytes } from "node:crypto";
import path from "node:path";

const DEFAULT_MAX_CAPABILITIES_PER_SENDER = 2_048;

/**
 * Issues opaque, sender-owned, path-scoped capabilities for local resources.
 * A URL for one file cannot be rewritten to read another file or another
 * window's workspace.
 */
export function createLocalFileCapabilityStore({
  createToken = () => randomBytes(32).toString("base64url"),
  maxCapabilitiesPerSender = DEFAULT_MAX_CAPABILITIES_PER_SENDER,
} = {}) {
  if (!Number.isSafeInteger(maxCapabilitiesPerSender) || maxCapabilitiesPerSender <= 0) {
    throw new TypeError("Local file capability limit must be a positive safe integer.");
  }

  const entriesByToken = new Map();
  const entriesBySender = new Map();

  function issue({ senderId, rootPath, relativePath, scope = "exact" }) {
    const normalizedSenderId = requireSenderId(senderId);
    const normalizedRoot = path.resolve(requireNonEmpty(rootPath, "Capability workspace root is required."));
    const normalizedRelative = normalizeRelativePath(relativePath);
    const normalizedScope = requireScope(scope);
    const scopePath = normalizedScope === "directory"
      ? path.posix.dirname(normalizedRelative).replace(/^\.$/, "")
      : normalizedRelative;
    let senderEntries = entriesBySender.get(normalizedSenderId);
    if (!senderEntries) {
      senderEntries = new Map();
      entriesBySender.set(normalizedSenderId, senderEntries);
    }

    const key = `${normalizedRoot}\0${normalizedScope}\0${scopePath}`;
    const existing = senderEntries.get(key);
    if (existing) {
      senderEntries.delete(key);
      senderEntries.set(key, existing);
      return existing.token;
    }

    let token;
    do {
      token = requireToken(createToken());
    } while (entriesByToken.has(token));
    const entry = {
      token,
      senderId: normalizedSenderId,
      rootPath: normalizedRoot,
      scope: normalizedScope,
      scopePath,
      key,
    };
    entriesByToken.set(token, entry);
    senderEntries.set(key, entry);
    while (senderEntries.size > maxCapabilitiesPerSender) {
      const oldest = senderEntries.values().next().value;
      if (!oldest) break;
      senderEntries.delete(oldest.key);
      entriesByToken.delete(oldest.token);
    }
    return token;
  }

  function validate({ token, rootPath, relativePath }) {
    if (typeof token !== "string" || token.length === 0) return false;
    const entry = entriesByToken.get(token);
    if (!entry) return false;
    let normalizedRoot;
    let normalizedRelative;
    try {
      normalizedRoot = path.resolve(requireNonEmpty(rootPath, "Capability workspace root is required."));
      normalizedRelative = normalizeRelativePath(relativePath);
    } catch {
      return false;
    }
    if (entry.rootPath !== normalizedRoot) return false;
    if (entry.scope === "exact") return entry.scopePath === normalizedRelative;
    return entry.scopePath === ""
      || normalizedRelative === entry.scopePath
      || normalizedRelative.startsWith(`${entry.scopePath}/`);
  }

  function revokeSender(senderId) {
    if (!Number.isSafeInteger(senderId)) return;
    const senderEntries = entriesBySender.get(senderId);
    if (!senderEntries) return;
    for (const entry of senderEntries.values()) entriesByToken.delete(entry.token);
    entriesBySender.delete(senderId);
  }

  return Object.freeze({ issue, validate, revokeSender });
}

export function buildLocalFileCapabilityUrl({ rootPath, relativePath, token }) {
  const encodedRoot = encodeURIComponent(requireNonEmpty(rootPath, "Local file root is required."));
  const encodedPath = normalizeRelativePath(relativePath)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `puppyone-local://file/${encodeURIComponent(requireToken(token))}/${encodedRoot}/${encodedPath}`;
}

function normalizeRelativePath(value) {
  const raw = requireNonEmpty(value, "Local file path is required.");
  if (path.isAbsolute(raw)) throw new Error("Local file path must be relative.");
  const segments = raw.replaceAll("\\", "/").split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Local file path is invalid.");
  }
  return segments.join("/");
}

function requireSenderId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Capability sender is invalid.");
  return value;
}

function requireNonEmpty(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function requireToken(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(value)) {
    throw new Error("Local file capability token is invalid.");
  }
  return value;
}

function requireScope(value) {
  if (value === "exact" || value === "directory") return value;
  throw new Error("Local file capability scope is invalid.");
}

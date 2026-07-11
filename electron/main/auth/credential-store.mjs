import fs from "node:fs";
import path from "node:path";

const CREDENTIAL_RECORD_VERSION = 2;

export function createCredentialStore({
  filePath,
  secureStorage,
  fsApi = fs.promises,
  platform = process.platform,
  allowInsecureStorage = process.env.PUPPYONE_ALLOW_INSECURE_TOKEN_STORAGE === "1",
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new TypeError("Credential store filePath is required.");
  }
  if (!secureStorage) throw new TypeError("Credential store secureStorage is required.");

  let mutationQueue = Promise.resolve();

  async function read() {
    await mutationQueue.catch(() => undefined);
    let raw;
    try {
      raw = await fsApi.readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }

    try {
      const envelope = JSON.parse(raw);
      const decrypted = decryptEnvelope(envelope, {
        secureStorage,
        platform,
        allowInsecureStorage,
      });
      const credential = normalizeCredentialRecord(decrypted);
      if (!credential) throw new Error("Credential record is invalid.");
      return credential;
    } catch (error) {
      if (error?.code === "SECURE_STORAGE_UNAVAILABLE") throw error;
      logger.warn?.("Unable to read PuppyOne credential store; quarantining it.", {
        error: error instanceof Error ? error.message : String(error),
      });
      await enqueueMutation(() => quarantineCorruptFile(filePath, fsApi, now));
      return null;
    }
  }

  function write(record) {
    const normalized = normalizeCredentialRecord(record);
    if (!normalized || normalized.version !== CREDENTIAL_RECORD_VERSION) {
      return Promise.reject(new Error("Credential record v2 is invalid."));
    }

    return enqueueMutation(async () => {
      const envelope = encryptEnvelope(normalized, {
        secureStorage,
        platform,
        allowInsecureStorage,
      });
      await writeJsonAtomic(filePath, envelope, fsApi, now);
      return normalized;
    });
  }

  function clear() {
    return enqueueMutation(async () => {
      await fsApi.rm(filePath, { force: true });
    });
  }

  function enqueueMutation(operation) {
    const next = mutationQueue.then(operation, operation);
    mutationQueue = next.catch(() => undefined);
    return next;
  }

  return {
    read,
    write,
    clear,
    getPath: () => filePath,
  };
}

export function normalizeCredentialRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const refreshToken = normalizeNonEmptyString(value.refresh_token);
  const userEmail = normalizeEmail(value.user_email);
  const apiOrigin = normalizeNonEmptyString(value.api_origin ?? value.api_base_url);
  if (!refreshToken || !userEmail || !apiOrigin) return null;

  const userId = normalizeNonEmptyString(value.user_id);
  if (Number(value.version) === CREDENTIAL_RECORD_VERSION && userId) {
    return {
      version: CREDENTIAL_RECORD_VERSION,
      user_id: userId,
      user_email: userEmail,
      api_origin: apiOrigin,
      refresh_token: refreshToken,
      updated_at: normalizeIsoTimestamp(value.updated_at) ?? new Date(0).toISOString(),
    };
  }

  // Version 1 persisted the full session. Keep only the minimum fields needed
  // to perform one refresh and migrate to v2; never return its access token.
  return {
    version: 1,
    user_id: userId,
    user_email: userEmail,
    api_origin: apiOrigin,
    refresh_token: refreshToken,
  };
}

function encryptEnvelope(record, options) {
  const payload = JSON.stringify(record);
  const storageMode = getSecureStorageMode(options);
  if (storageMode === "secure") {
    return {
      version: CREDENTIAL_RECORD_VERSION,
      storage: "electron-safe-storage",
      data: options.secureStorage.encryptString(payload).toString("base64"),
    };
  }
  return {
    version: CREDENTIAL_RECORD_VERSION,
    storage: "plaintext-dev",
    data: record,
  };
}

function decryptEnvelope(envelope, options) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("Credential envelope is invalid.");
  }
  if (envelope.storage === "electron-safe-storage" && typeof envelope.data === "string") {
    getSecureStorageMode({ ...options, allowInsecureStorage: false });
    const decrypted = options.secureStorage.decryptString(Buffer.from(envelope.data, "base64"));
    return JSON.parse(decrypted);
  }
  if (envelope.storage === "plaintext-dev" && options.allowInsecureStorage) {
    return envelope.data;
  }
  throw new Error("Credential envelope storage mode is not allowed.");
}

function getSecureStorageMode({ secureStorage, platform, allowInsecureStorage }) {
  const encryptionAvailable = secureStorage.isEncryptionAvailable() === true;
  const backend = platform === "linux" && typeof secureStorage.getSelectedStorageBackend === "function"
    ? secureStorage.getSelectedStorageBackend()
    : null;
  if (encryptionAvailable && backend !== "basic_text") return "secure";
  if (allowInsecureStorage) return "insecure-dev";

  const error = new Error(
    backend === "basic_text"
      ? "Secure credential storage is using the unprotected Linux basic_text backend."
      : "Secure credential storage is unavailable on this device.",
  );
  error.code = "SECURE_STORAGE_UNAVAILABLE";
  throw error;
}

async function writeJsonAtomic(filePath, value, fsApi, now) {
  const directory = path.dirname(filePath);
  await fsApi.mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  let handle = null;
  try {
    handle = await fsApi.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fsApi.rename(temporaryPath, filePath);
    await fsApi.chmod(filePath, 0o600).catch(() => undefined);
    await syncDirectoryBestEffort(directory, fsApi);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await fsApi.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function syncDirectoryBestEffort(directory, fsApi) {
  let handle = null;
  try {
    handle = await fsApi.open(directory, "r");
    await handle.sync();
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

async function quarantineCorruptFile(filePath, fsApi, now) {
  const quarantinePath = `${filePath}.corrupt.${now()}`;
  try {
    await fsApi.rename(filePath, quarantinePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEmail(value) {
  const normalized = normalizeNonEmptyString(value);
  return normalized && normalized.includes("@") ? normalized : null;
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

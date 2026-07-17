import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SECRET_ENTRY_VERSION = 1;
const SECRET_REF_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Main-process-only durable storage for one-time Cloud publish credentials.
 *
 * The publish journal stores only the opaque secretRef. The credential itself
 * is encrypted by Electron safeStorage and lives in a separate 0600 file. No
 * method on this object is exposed through IPC.
 */
export function createCloudPublishSecretVault({
  baseDirectory,
  secureStorage,
  fsApi = fs.promises,
  randomUUID = crypto.randomUUID,
  now = () => Date.now(),
} = {}) {
  if (typeof baseDirectory !== "string" || !baseDirectory.trim()) {
    throw new TypeError("Cloud publish SecretVault baseDirectory is required.");
  }
  if (!secureStorage) {
    throw new TypeError("Cloud publish SecretVault secureStorage is required.");
  }

  function createRef() {
    return randomUUID();
  }

  async function put(secretRef, secret) {
    const normalizedRef = requireSecretRef(secretRef);
    if (typeof secret !== "string" || !secret) {
      throw createVaultError("Cloud publish credential is invalid.");
    }
    requireSecureStorage(secureStorage);
    const entryPath = resolveEntryPath(baseDirectory, normalizedRef);
    const envelope = {
      version: SECRET_ENTRY_VERSION,
      storage: "electron-safe-storage",
      secret_ref: normalizedRef,
      data: secureStorage.encryptString(secret).toString("base64"),
    };
    await writeJsonAtomic(entryPath, envelope, fsApi, now);
    return normalizedRef;
  }

  async function get(secretRef) {
    const normalizedRef = requireSecretRef(secretRef);
    requireSecureStorage(secureStorage);
    const entryPath = resolveEntryPath(baseDirectory, normalizedRef);
    let raw;
    try {
      raw = await fsApi.readFile(entryPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw createVaultError("Unable to read the Cloud publish credential.", error);
    }
    try {
      const envelope = JSON.parse(raw);
      if (
        envelope?.version !== SECRET_ENTRY_VERSION
        || envelope?.storage !== "electron-safe-storage"
        || envelope?.secret_ref !== normalizedRef
        || typeof envelope?.data !== "string"
        || !envelope.data
      ) {
        throw new Error("SecretVault entry is invalid.");
      }
      const secret = secureStorage.decryptString(Buffer.from(envelope.data, "base64"));
      if (typeof secret !== "string" || !secret) {
        throw new Error("SecretVault entry decrypted to an invalid credential.");
      }
      return secret;
    } catch (error) {
      throw createVaultError("Unable to decrypt the Cloud publish credential.", error);
    }
  }

  async function clear(secretRef) {
    const normalizedRef = requireSecretRef(secretRef);
    const entryPath = resolveEntryPath(baseDirectory, normalizedRef);
    await fsApi.rm(entryPath, { force: true }).catch((error) => {
      throw createVaultError("Unable to clear the Cloud publish credential.", error);
    });
    await syncDirectoryBestEffort(baseDirectory, fsApi);
  }

  return {
    createRef,
    put,
    get,
    clear,
    getEntryPath: (secretRef) => resolveEntryPath(baseDirectory, requireSecretRef(secretRef)),
  };
}

function requireSecureStorage(secureStorage) {
  const available = secureStorage.isEncryptionAvailable?.() === true;
  const backend = typeof secureStorage.getSelectedStorageBackend === "function"
    ? secureStorage.getSelectedStorageBackend()
    : null;
  if (!available || backend === "basic_text") {
    throw createVaultError(
      backend === "basic_text"
        ? "Secure credential storage is using an unprotected backend."
        : "Secure credential storage is unavailable on this device.",
    );
  }
}

function requireSecretRef(value) {
  if (typeof value !== "string" || !SECRET_REF_PATTERN.test(value)) {
    throw createVaultError("Cloud publish credential reference is invalid.");
  }
  return value.toLowerCase();
}

function resolveEntryPath(baseDirectory, secretRef) {
  return path.join(path.resolve(baseDirectory), `${secretRef}.secret.json`);
}

async function writeJsonAtomic(filePath, value, fsApi, now) {
  const directory = path.dirname(filePath);
  await fsApi.mkdir(directory, { recursive: true, mode: 0o700 });
  await fsApi.chmod(directory, 0o700).catch(() => undefined);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${now()}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let handle = null;
  try {
    handle = await fsApi.open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
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
    // Directory fsync is not uniformly supported (notably on Windows).
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

function createVaultError(message, cause = undefined) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = "CLOUD_PUBLISH_SECRET_VAULT_FAILED";
  return error;
}

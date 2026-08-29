export function createPlatformCapabilitySnapshot({ adapter, safeStorage }) {
  const credentialStorage = inspectCredentialStorage({
    platform: adapter.platform,
    safeStorage,
  });
  return deepFreeze({
    schemaVersion: 1,
    platform: adapter.platform,
    arch: adapter.arch,
    primaryModifier: adapter.primaryModifier,
    windowChrome: {
      mode: adapter.windowChrome.mode,
    },
    credentialStorage,
    documentConversion: {
      supportedInputs: adapter.documents.supportedInputs,
    },
    updater: {
      supported: adapter.updater.supported,
      installMode: adapter.updater.installMode,
    },
  });
}

function inspectCredentialStorage({ platform, safeStorage }) {
  const encryptionAvailable = safeStorage?.isEncryptionAvailable?.() === true;
  const backend = platform === "linux" && typeof safeStorage?.getSelectedStorageBackend === "function"
    ? safeStorage.getSelectedStorageBackend()
    : null;
  const plaintextFallback = backend === "basic_text";
  const available = encryptionAvailable && !plaintextFallback;
  return {
    available,
    locked: false,
    strength: available ? "os-backed" : "unavailable",
    backend,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

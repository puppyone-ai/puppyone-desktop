export const DESKTOP_PLATFORMS = Object.freeze(["macos", "windows", "linux"]);
export const DESKTOP_ARCHITECTURES = Object.freeze(["x64", "arm64"]);

const NODE_PLATFORM_TO_DESKTOP = Object.freeze({
  darwin: "macos",
  win32: "windows",
  linux: "linux",
});

const DESKTOP_PLATFORM_TO_NODE = Object.freeze({
  macos: "darwin",
  windows: "win32",
  linux: "linux",
});

export function isDesktopPlatform(value) {
  return DESKTOP_PLATFORMS.includes(value);
}

export function isDesktopArchitecture(value) {
  return DESKTOP_ARCHITECTURES.includes(value);
}

export function normalizeDesktopPlatform(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!isDesktopPlatform(normalized)) {
    throw new Error(`Desktop platform must be macos, windows, or linux; received ${String(value)}`);
  }
  return normalized;
}

export function normalizeDesktopArchitecture(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!isDesktopArchitecture(normalized)) {
    throw new Error(`Desktop architecture must be x64 or arm64; received ${String(value)}`);
  }
  return normalized;
}

export function desktopPlatformFromNode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const platform = NODE_PLATFORM_TO_DESKTOP[normalized];
  if (!platform) {
    throw new Error(`Unsupported Node Desktop platform: ${String(value)}`);
  }
  return platform;
}

export function nodePlatformFromDesktop(value) {
  return DESKTOP_PLATFORM_TO_NODE[normalizeDesktopPlatform(value)];
}

export function createDesktopTarget({ platform, arch }) {
  const target = {
    platform: normalizeDesktopPlatform(platform),
    arch: normalizeDesktopArchitecture(arch),
  };
  return deepFreeze({
    ...target,
    id: `${target.platform}-${target.arch}`,
  });
}

export function createDesktopTargetFromNode({
  platform = process.platform,
  arch = process.arch,
} = {}) {
  return createDesktopTarget({
    platform: desktopPlatformFromNode(platform),
    arch,
  });
}

export function assertDesktopTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Desktop target must be an object.");
  }
  const target = createDesktopTarget(value);
  if (value.id != null && value.id !== target.id) {
    throw new Error(`Desktop target id must be ${target.id}.`);
  }
  return target;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

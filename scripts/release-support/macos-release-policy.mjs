const STABLE_UPDATE_URL = "https://updates.puppyone.ai/desktop/stable/mac";

export function inspectMacReleaseReadiness({
  packageMetadata,
  env = process.env,
  platform = process.platform,
  requireUploadCredentials = false,
}) {
  const errors = [];
  const mac = packageMetadata?.build?.mac ?? {};
  const publish = Array.isArray(packageMetadata?.build?.publish)
    ? packageMetadata.build.publish
    : [packageMetadata?.build?.publish].filter(Boolean);
  const version = packageMetadata?.version;

  if (platform !== "darwin") {
    errors.push("stable macOS releases must be built and verified on macOS");
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    errors.push("stable releases require a non-prerelease semantic package version");
  }
  if (mac.identity === "-" || mac.identity === null) {
    errors.push("production macOS config must not force ad-hoc or disabled signing");
  }
  if (mac.hardenedRuntime !== true) {
    errors.push("production macOS config must explicitly enable hardenedRuntime");
  }
  if (mac.notarize !== true) {
    errors.push("production macOS config must explicitly enable notarization");
  }
  if (mac.strictVerify !== true) {
    errors.push("production macOS config must explicitly enable strict signature verification");
  }

  const targets = normalizeTargets(mac.target);
  for (const requiredTarget of ["dmg", "zip"]) {
    if (!targets.has(requiredTarget)) {
      errors.push(`production macOS config must build the ${requiredTarget} target`);
    }
  }

  const stableProvider = publish.find((candidate) => candidate?.provider === "generic");
  if (
    stableProvider?.url !== STABLE_UPDATE_URL
    || stableProvider?.channel !== "stable"
    || !String(stableProvider?.url ?? "").startsWith("https://")
  ) {
    errors.push(`the signed app must embed the stable HTTPS update feed ${STABLE_UPDATE_URL}`);
  }

  if (env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    errors.push("CSC_IDENTITY_AUTO_DISCOVERY=false is reserved for internal unsigned builds");
  }
  const hasCertificateFile = hasValue(env.CSC_LINK);
  const hasKeychainIdentity = hasValue(env.CSC_NAME);
  if (!hasCertificateFile && !hasKeychainIdentity) {
    errors.push("set CSC_LINK (CI) or CSC_NAME (provisioned keychain) for Developer ID signing");
  }
  if (hasCertificateFile && !hasValue(env.CSC_KEY_PASSWORD)) {
    errors.push("CSC_LINK must be protected by CSC_KEY_PASSWORD");
  }

  const notarizationModes = [
    {
      label: "App Store Connect API key",
      keys: ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
    },
    {
      label: "Apple ID",
      keys: ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
    },
    {
      label: "notarytool keychain profile",
      keys: ["APPLE_KEYCHAIN_PROFILE"],
    },
  ];
  const completeNotarizationMode = notarizationModes.find(({ keys }) => keys.every((key) => hasValue(env[key])));
  if (!completeNotarizationMode) {
    const partialModes = notarizationModes.filter(({ keys }) => keys.some((key) => hasValue(env[key])));
    if (partialModes.length > 0) {
      for (const { label, keys } of partialModes) {
        const missing = keys.filter((key) => !hasValue(env[key]));
        if (missing.length > 0) errors.push(`${label} notarization credentials are incomplete: missing ${missing.join(", ")}`);
      }
    } else {
      errors.push("configure one complete electron-builder notarization credential set");
    }
  }

  if (hasValue(env.PUPPYONE_RELEASE_TAG) && env.PUPPYONE_RELEASE_TAG !== `v${version}`) {
    errors.push(`PUPPYONE_RELEASE_TAG must exactly match package version v${version}`);
  }

  if (requireUploadCredentials) {
    for (const key of [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "CLOUDFLARE_ACCOUNT_ID",
      "PUPPYONE_RELEASE_TAG",
    ]) {
      if (!hasValue(env[key])) errors.push(`stable R2 publishing requires ${key}`);
    }
  }

  return errors;
}

export function assertMacReleaseReadiness(options) {
  const errors = inspectMacReleaseReadiness(options);
  if (errors.length === 0) return;
  throw new Error(`Stable macOS release readiness failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

export function getStableReleaseCoordinates({ packageMetadata, env = process.env }) {
  const version = packageMetadata.version;
  const tag = env.PUPPYONE_RELEASE_TAG || `v${version}`;
  return {
    bucket: env.R2_BUCKET || "puppyone-desktop",
    endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    latestPrefix: "desktop/stable/mac/latest",
    tag,
    versionPrefix: `desktop/stable/mac/${tag}`,
  };
}

function normalizeTargets(value) {
  const targets = Array.isArray(value) ? value : value == null ? [] : [value];
  return new Set(targets.map((target) => (
    typeof target === "string" ? target : target?.target
  )).filter(Boolean));
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

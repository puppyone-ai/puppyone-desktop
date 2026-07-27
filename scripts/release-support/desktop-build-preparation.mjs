import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertDesktopBuildInfo,
  createDesktopBuildR2Prefix,
  createDesktopBuildReleaseName,
  createDesktopBuildTag,
  getDesktopBuildChannelPolicy,
  resolveDesktopBuildIdentity,
} from "../../shared/desktop-build-identity.mjs";

export const DEFAULT_BUILD_INFO_PATH = "generated/desktop-build-info.json";
export const DEFAULT_BUILDER_CONFIG_PATH = "generated/electron-builder.json";

export async function prepareDesktopBuild({
  repositoryRoot,
  channel,
  buildNumber = null,
  commitSha = null,
  builtAt = null,
  sourceDirty = null,
  expectedTag = null,
  buildInfoPath = DEFAULT_BUILD_INFO_PATH,
  builderConfigPath = DEFAULT_BUILDER_CONFIG_PATH,
} = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  const packageMetadata = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  const resolvedCommitSha = commitSha ?? readGitCommit(root);
  const resolvedSourceDirty = sourceDirty ?? readGitDirty(root);
  const buildInfo = resolveDesktopBuildIdentity({
    baseVersion: packageMetadata.version,
    channel,
    commitSha: resolvedCommitSha,
    buildNumber,
    builtAt: builtAt ?? new Date().toISOString(),
    sourceDirty: resolvedSourceDirty,
  });
  const tag = createDesktopBuildTag(buildInfo);
  if (expectedTag != null && expectedTag !== tag) {
    throw new Error(`Release tag ${expectedTag} must exactly match resolved build tag ${tag}.`);
  }

  const relativeBuildInfoPath = normalizeRepositoryRelativePath(root, buildInfoPath);
  const relativeBuilderConfigPath = normalizeRepositoryRelativePath(root, builderConfigPath);
  const builderConfig = createDesktopElectronBuilderConfig({
    packageMetadata,
    buildInfo,
    buildInfoPath: relativeBuildInfoPath,
  });

  await writeJsonAtomic(path.join(root, relativeBuildInfoPath), buildInfo);
  await writeJsonAtomic(path.join(root, relativeBuilderConfigPath), builderConfig);

  return Object.freeze({
    buildInfo,
    buildInfoPath: relativeBuildInfoPath,
    builderConfig,
    builderConfigPath: relativeBuilderConfigPath,
    tag,
    releaseName: createDesktopBuildReleaseName(buildInfo),
    artifactName: tag ? `puppyone-desktop-${tag}` : `puppyone-desktop-${buildInfo.version}`,
    r2Prefix: tag ? createDesktopBuildR2Prefix(buildInfo) : null,
  });
}

export function createDesktopElectronBuilderConfig({
  packageMetadata,
  buildInfo,
  buildInfoPath = DEFAULT_BUILD_INFO_PATH,
}) {
  const identity = assertDesktopBuildInfo(buildInfo);
  const policy = getDesktopBuildChannelPolicy(identity.channel);
  const baseBuild = structuredClone(packageMetadata?.build ?? {});
  const extraResources = Array.isArray(baseBuild.extraResources)
    ? [...baseBuild.extraResources]
    : [];
  const withoutGeneratedBuildInfo = extraResources.filter((entry) => (
    entry?.to !== "build-info.json"
  ));
  withoutGeneratedBuildInfo.push({
    from: buildInfoPath,
    to: "build-info.json",
  });

  const config = {
    ...baseBuild,
    appId: policy.applicationId,
    productName: policy.applicationName,
    executableName: policy.applicationName,
    artifactName: "puppyone-${version}-${arch}.${ext}",
    buildVersion: identity.platformBuildNumber ?? identity.baseVersion,
    extraMetadata: {
      ...(baseBuild.extraMetadata ?? {}),
      version: identity.version,
    },
    extraResources: withoutGeneratedBuildInfo,
    publish: policy.updateFeedUrl
      ? [{
          provider: "generic",
          url: policy.updateFeedUrl,
          channel: policy.updateChannel,
        }]
      : [],
    mac: {
      ...(baseBuild.mac ?? {}),
      executableName: policy.applicationName,
      bundleShortVersion: identity.baseVersion,
      bundleVersion: identity.platformBuildNumber ?? identity.baseVersion,
      ...(identity.channel === "stable"
        ? {}
        : {
            identity: "-",
            hardenedRuntime: false,
            notarize: false,
            strictVerify: false,
          }),
      extendInfo: {
        ...(baseBuild.mac?.extendInfo ?? {}),
        CFBundleName: policy.applicationName,
        CFBundleDisplayName: policy.applicationName,
      },
    },
    dmg: {
      ...(baseBuild.dmg ?? {}),
      artifactName: "puppyone-${version}-${arch}.${ext}",
    },
  };

  return config;
}

export function readGitCommit(repositoryRoot) {
  const result = runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const commitSha = result.stdout.trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commitSha)) {
    throw new Error("Git did not return a full commit SHA for the Desktop build.");
  }
  return commitSha;
}

export function readGitDirty(repositoryRoot) {
  return runGit(repositoryRoot, ["status", "--porcelain", "--untracked-files=normal"]).stdout.trim().length > 0;
}

function runGit(repositoryRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result;
}

function normalizeRepositoryRelativePath(root, value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Generated Desktop build file must stay inside the repository: ${value}`);
  }
  return relative;
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

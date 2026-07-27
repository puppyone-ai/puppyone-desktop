import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertDesktopBuildInfo,
  getDesktopBuildChannelPolicy,
  resolveDesktopBuildIdentity,
} from "../../shared/desktop-build-identity.mjs";

const PACKAGED_BUILD_INFO_FILENAME = "build-info.json";
const DEVELOPMENT_BUILD_INFO_PATH = path.join("generated", "desktop-build-info.json");

export function loadDesktopBuildInfo({
  app,
  packageMetadata,
  projectRoot,
  resourcesPath = process.resourcesPath,
  now = () => new Date().toISOString(),
}) {
  if (app.isPackaged) {
    const buildInfoPath = path.join(resourcesPath, PACKAGED_BUILD_INFO_FILENAME);
    const buildInfo = readRequiredBuildInfo(buildInfoPath);
    if (buildInfo.version !== app.getVersion()) {
      throw new Error(
        `Packaged Desktop version ${app.getVersion()} does not match Build Identity ${buildInfo.version}.`,
      );
    }
    return buildInfo;
  }

  const generatedPath = path.join(projectRoot, DEVELOPMENT_BUILD_INFO_PATH);
  const generated = readOptionalDevelopmentBuildInfo(generatedPath);
  if (generated) return generated;

  return resolveDesktopBuildIdentity({
    baseVersion: packageMetadata.version,
    channel: "dev",
    commitSha: readDevelopmentCommit(projectRoot),
    builtAt: now(),
    sourceDirty: readDevelopmentSourceDirty(projectRoot),
  });
}

export function configureDesktopApplicationIdentity({
  app,
  buildInfo,
  platform = process.platform,
}) {
  const identity = assertDesktopBuildInfo(buildInfo);
  const policy = getDesktopBuildChannelPolicy(identity.channel);
  const userDataPath = path.join(app.getPath("appData"), policy.userDataName);

  app.setName(policy.applicationName);
  app.setPath("userData", userDataPath);
  if (platform === "win32") {
    app.setAppUserModelId(policy.applicationId);
  }

  return Object.freeze({
    applicationId: policy.applicationId,
    applicationName: policy.applicationName,
    userDataPath,
  });
}

function readRequiredBuildInfo(filePath) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Packaged PuppyOne Desktop is missing valid ${PACKAGED_BUILD_INFO_FILENAME}: ${detail}`);
  }
  return assertDesktopBuildInfo(value);
}

function readOptionalDevelopmentBuildInfo(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buildInfo = assertDesktopBuildInfo(JSON.parse(fs.readFileSync(filePath, "utf8")));
    return buildInfo.channel === "dev" ? buildInfo : null;
  } catch (error) {
    console.warn("Ignoring invalid generated development Build Identity:", error);
    return null;
  }
}

function readDevelopmentCommit(projectRoot) {
  const result = runGit(projectRoot, ["rev-parse", "HEAD"]);
  const commitSha = result?.stdout.trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(commitSha ?? "") ? commitSha : "0".repeat(40);
}

function readDevelopmentSourceDirty(projectRoot) {
  const result = runGit(projectRoot, ["status", "--porcelain", "--untracked-files=normal"]);
  return result ? result.stdout.trim().length > 0 : true;
}

function runGit(projectRoot, args) {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
    timeout: 3_000,
  });
  return result.status === 0 ? result : null;
}

import { afterEach, describe, expect, it } from "vitest";
import asarPackage from "@electron/asar";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import plistPackage from "plist";
import { verifyPackagedDesktopBuild } from "../scripts/release-support/packaged-desktop-build-verifier.mjs";
import {
  getDesktopBuildChannelPolicy,
  resolveDesktopBuildIdentity,
} from "../shared/desktop-build-identity.mjs";
import {
  DESKTOP_STABLE_UPDATE_FEED_URL,
} from "../shared/desktop-distribution-contract.mjs";

const { createPackage } = asarPackage;
const { build: buildPlist } = plistPackage;
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.rm(directory, { force: true, recursive: true })
  )));
});

describe("packaged Desktop Build Identity verification", () => {
  it("verifies app metadata, embedded identity, update feed, and artifact names", async () => {
    const fixture = await createFixture();
    await expect(verifyPackagedDesktopBuild({
      releaseDirectory: fixture.releaseDirectory,
      buildInfo: fixture.buildInfo,
    })).resolves.toMatchObject({
      applications: [fixture.applicationPath],
    });
  });

  it("fails when a packaged Internal app embeds a Stable update feed", async () => {
    const fixture = await createFixture();
    await fs.writeFile(
      path.join(fixture.applicationPath, "Contents", "Resources", "app-update.yml"),
      `provider: generic\nurl: ${DESKTOP_STABLE_UPDATE_FEED_URL}\nchannel: stable\n`,
    );

    await expect(verifyPackagedDesktopBuild({
      releaseDirectory: fixture.releaseDirectory,
      buildInfo: fixture.buildInfo,
    })).rejects.toThrow(/canonical update feed/);
  });

  it("fails when the canonical native Dock icon resource is absent", async () => {
    const fixture = await createFixture();
    await fs.rm(path.join(
      fixture.applicationPath,
      "Contents",
      "Resources",
      "puppy-app-image.png",
    ));

    await expect(verifyPackagedDesktopBuild({
      releaseDirectory: fixture.releaseDirectory,
      buildInfo: fixture.buildInfo,
    })).rejects.toThrow(/missing Dock icon resource puppy-app-image\.png/);
  });
});

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "puppyone-packaged-identity-"));
  temporaryDirectories.push(root);
  const releaseDirectory = path.join(root, "release");
  const buildInfo = resolveDesktopBuildIdentity({
    baseVersion: "1.4.0",
    buildNumber: 72,
    builtAt: "2026-07-26T10:00:00.000Z",
    channel: "internal",
    commitSha: "a".repeat(40),
  });
  const policy = getDesktopBuildChannelPolicy(buildInfo.channel);
  const applicationPath = path.join(
    releaseDirectory,
    "mac-arm64",
    `${policy.applicationName.toLocaleLowerCase("en-US")}.app`,
  );
  const resourcesDirectory = path.join(applicationPath, "Contents", "Resources");
  const sourceDirectory = path.join(root, "asar-source");
  await fs.mkdir(resourcesDirectory, { recursive: true });
  await fs.mkdir(sourceDirectory, { recursive: true });
  await fs.writeFile(
    path.join(sourceDirectory, "package.json"),
    JSON.stringify({ name: "@puppyone/desktop", version: buildInfo.version }),
  );
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await createPackage(sourceDirectory, path.join(resourcesDirectory, "app.asar"));
  for (const resourceFilename of [
    "puppy-app-image.png",
  ]) {
    await fs.writeFile(path.join(resourcesDirectory, resourceFilename), png);
  }
  await fs.writeFile(
    path.join(resourcesDirectory, "build-info.json"),
    `${JSON.stringify(buildInfo, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(resourcesDirectory, "app-update.yml"),
    `provider: generic\nurl: ${policy.updateFeedUrl}\nchannel: ${policy.updateChannel}\n`,
  );
  await fs.writeFile(
    path.join(applicationPath, "Contents", "Info.plist"),
    buildPlist({
      CFBundleIdentifier: policy.applicationId,
      CFBundleName: policy.applicationName,
      CFBundleDisplayName: policy.applicationName,
      CFBundleShortVersionString: buildInfo.baseVersion,
      CFBundleVersion: buildInfo.platformBuildNumber,
    }),
  );
  await fs.writeFile(
    path.join(releaseDirectory, `puppyone-${buildInfo.version}-arm64.dmg`),
    "dmg",
  );
  await fs.writeFile(
    path.join(releaseDirectory, `puppyone-${buildInfo.version}-arm64.zip`),
    "zip",
  );
  await fs.writeFile(
    path.join(releaseDirectory, `${policy.updateChannel}-mac.yml`),
    `version: ${buildInfo.version}\npath: puppyone-${buildInfo.version}-arm64.zip\n`,
  );
  return { applicationPath, buildInfo, releaseDirectory };
}

#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_BUILD_CHANNELS,
  getDesktopBuildChannelPolicy,
  resolveDesktopBuildIdentity,
} from "../shared/desktop-build-identity.mjs";
import { createDesktopElectronBuilderConfig } from "./release-support/desktop-build-preparation.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const packageMetadata = await readJson("package.json");
const commitSha = "a".repeat(40);

if (DESKTOP_BUILD_CHANNELS.join(",") !== "dev,internal,stable") {
  errors.push("the active Desktop build-channel union must be exactly dev, internal, stable");
}

const policies = DESKTOP_BUILD_CHANNELS.map(getDesktopBuildChannelPolicy);
for (const field of ["applicationId", "applicationName", "userDataName"]) {
  if (new Set(policies.map((policy) => policy[field])).size !== policies.length) {
    errors.push(`every Desktop channel must have a unique ${field}`);
  }
}
if (getDesktopBuildChannelPolicy("dev").updateFeedUrl !== null) {
  errors.push("Development builds must not have a product update feed");
}
if (!getDesktopBuildChannelPolicy("internal").updateFeedUrl?.includes("/internal/")) {
  errors.push("Internal builds must use the Internal update feed");
}
if (!getDesktopBuildChannelPolicy("stable").updateFeedUrl?.includes("/stable/")) {
  errors.push("Stable builds must use the Stable update feed");
}

const identities = {
  dev: resolveDesktopBuildIdentity({
    baseVersion: packageMetadata.version,
    channel: "dev",
    commitSha,
  }),
  internal: resolveDesktopBuildIdentity({
    baseVersion: packageMetadata.version,
    buildNumber: 101,
    channel: "internal",
    commitSha,
  }),
  stable: resolveDesktopBuildIdentity({
    baseVersion: packageMetadata.version,
    buildNumber: 102,
    channel: "stable",
    commitSha,
  }),
};

for (const channel of DESKTOP_BUILD_CHANNELS) {
  const config = createDesktopElectronBuilderConfig({
    packageMetadata,
    buildInfo: identities[channel],
  });
  if (config.extraMetadata?.version !== identities[channel].version) {
    errors.push(`${channel} packaging must inject the complete Build Identity version`);
  }
  if (!config.extraResources?.some((entry) => entry?.to === "build-info.json")) {
    errors.push(`${channel} packaging must embed build-info.json`);
  }
  if (config.mac?.bundleShortVersion !== identities[channel].baseVersion) {
    errors.push(`${channel} packaging must use the stable base as the macOS marketing version`);
  }
}

const packageScripts = packageMetadata.scripts ?? {};
if (!packageScripts.dev?.includes("prepare:desktop-build:dev")) {
  errors.push("the Electron development launcher must prepare Development Build Identity");
}
if (!packageScripts["dist:mac:prepared"]?.includes("generated/electron-builder.json")) {
  errors.push("prepared macOS packaging must consume the generated electron-builder configuration");
}

const mainSource = await readText("electron/main.mjs");
requireSource(mainSource, "loadDesktopBuildInfo", "Electron main must load Build Identity before constructing services");
requireSource(mainSource, "configureDesktopApplicationIdentity", "Electron main must configure channel isolation");
requireSource(mainSource, "registerBuildInfoIpcHandlers", "Electron main must expose typed Build Info IPC");
if (mainSource.includes("app.getVersion()")) {
  errors.push("Electron main services must receive Build Identity instead of calling app.getVersion()");
}

const updaterSource = await readText("electron/update-service.mjs");
requireSource(updaterSource, "getDesktopBuildChannelPolicy", "the updater must derive its feed from channel policy");
for (const forbidden of [
  "PUPPYONE_DESKTOP_UPDATE_CHANNEL",
  "PUPPYONE_DESKTOP_UPDATE_URL",
  "normalizeUpdateChannel",
]) {
  if (updaterSource.includes(forbidden)) {
    errors.push(`packaged updater authority must not depend on ${forbidden}`);
  }
}

const rendererTypeSource = await readText("src/types/electron.d.ts");
requireSource(
  rendererTypeSource,
  'export type DesktopBuildChannel = "dev" | "internal" | "stable"',
  "renderer BuildChannel must contain exactly the three product channels",
);
if (/DesktopUpdateState[\s\S]{0,500}"beta"/.test(rendererTypeSource)) {
  errors.push("Beta must not remain in the active Desktop update contract");
}

const preloadSource = await readText("electron/preload.cjs");
requireSource(preloadSource, 'ipcRenderer.invoke("build-info:get")', "preload must expose read-only Build Info IPC");

const generalSettingsSource = await readText("src/features/settings/main/GeneralSettingsView.tsx");
requireSource(
  generalSettingsSource,
  "<DesktopBuildVersionSettingsRow />",
  "Settings General must own the user-facing Build Identity",
);
const sidebarSources = [
  await readText("src/features/app-shell/DesktopDataWorkspaceSurface.tsx"),
  await readText("src/features/app-shell/navigation/DesktopSidebarFooterNavigation.tsx"),
].join("\n");
if (sidebarSources.includes("DesktopBuildIdentity")) {
  errors.push("Build Identity must not be rendered in a Side Panel");
}

if (errors.length > 0) {
  console.error("Desktop Build Identity architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Desktop Build Identity architecture check passed.");

function requireSource(source, snippet, message) {
  if (!source.includes(snippet)) errors.push(message);
}

async function readText(relativePath) {
  return fs.readFile(path.join(repositoryRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

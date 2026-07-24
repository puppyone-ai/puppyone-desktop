#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createChecksumsFile,
  createDesktopReleaseManifest,
  createLatestPointer,
  jsonFile,
  verifyDesktopReleaseBundle,
} from "./release-support/desktop-release-metadata.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const [command, ...rawArgs] = process.argv.slice(2);
  const args = parseArguments(rawArgs);
  if (command === "create") {
    await createBundle(args);
  } else if (command === "verify") {
    await verifyBundle(args);
  } else {
    throw new Error("Usage: create-desktop-release-bundle.mjs <create|verify> [options]");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function createBundle(args) {
  const bundleDirectory = resolveBundleDirectory(required(args, "bundle"));
  const assetPaths = arrayOption(args, "asset").map((value) => path.resolve(repoRoot, value));
  if (assetPaths.length === 0) throw new Error("At least one --asset is required");
  const notesFile = path.resolve(repoRoot, required(args, "notes-file"));

  await fs.rm(bundleDirectory, { recursive: true, force: true });
  await fs.mkdir(path.join(bundleDirectory, "assets"), { recursive: true });
  const copiedAssets = [];
  for (const sourcePath of assetPaths) {
    const destinationPath = path.join(bundleDirectory, "assets", path.basename(sourcePath));
    await fs.copyFile(sourcePath, destinationPath);
    copiedAssets.push(destinationPath);
  }
  await fs.copyFile(notesFile, path.join(bundleDirectory, "release-notes.md"));

  const channel = required(args, "channel");
  const manifest = await createDesktopReleaseManifest({
    arch: required(args, "arch"),
    assetPaths: copiedAssets,
    channel,
    commitSha: option(args, "commit"),
    developerIdSigned: booleanOption(args, "developer-id-signed"),
    notarized: booleanOption(args, "notarized"),
    prerelease: booleanOption(args, "prerelease"),
    provenance: option(args, "provenance") ?? (channel === "archive" ? "archive" : "pipeline"),
    publicOrigin: required(args, "public-origin"),
    publishedAt: option(args, "published-at") ?? new Date().toISOString(),
    repository: required(args, "repository"),
    r2Prefix: required(args, "r2-prefix"),
    tag: required(args, "tag"),
    version: required(args, "version"),
    workflowRunUrl: option(args, "workflow-run-url"),
  });
  await fs.writeFile(path.join(bundleDirectory, "release.json"), jsonFile(manifest));
  await fs.writeFile(path.join(bundleDirectory, "SHA256SUMS"), createChecksumsFile(manifest));
  if (channel !== "archive") {
    await fs.writeFile(path.join(bundleDirectory, "latest.json"), jsonFile(createLatestPointer(manifest)));
  }
  await verifyDesktopReleaseBundle(bundleDirectory);
  console.log(`Created verified desktop release bundle for ${manifest.tag} at ${bundleDirectory}`);
}

async function verifyBundle(args) {
  const bundleDirectory = resolveBundleDirectory(required(args, "bundle"));
  const expected = Object.fromEntries([
    ["tag", option(args, "tag")],
    ["channel", option(args, "channel")],
    ["commitSha", option(args, "commit")],
  ].filter(([, value]) => value != null));
  const { manifest } = await verifyDesktopReleaseBundle(bundleDirectory, expected);
  console.log(JSON.stringify({
    tag: manifest.tag,
    channel: manifest.channel,
    commitSha: manifest.commitSha,
    r2Prefix: manifest.r2.prefix,
    assetCount: manifest.assets.length,
  }));
}

function resolveBundleDirectory(value) {
  const artifactsRoot = path.join(repoRoot, "artifacts");
  const resolved = path.resolve(repoRoot, value);
  const relative = path.relative(artifactsRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.length === 0) {
    throw new Error("Release bundles must be stored in a child directory of artifacts/");
  }
  return resolved;
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = values[index + 1];
    if (value == null || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    index += 1;
    const existing = result.get(key) ?? [];
    existing.push(value);
    result.set(key, existing);
  }
  return result;
}

function required(args, key) {
  const value = option(args, key);
  if (value == null || value.length === 0) throw new Error(`Missing required --${key}`);
  return value;
}

function option(args, key) {
  const values = args.get(key);
  if (!values || values.length === 0) return undefined;
  if (values.length > 1 && key !== "asset") throw new Error(`--${key} may only be specified once`);
  return values.at(-1);
}

function arrayOption(args, key) {
  return args.get(key) ?? [];
}

function booleanOption(args, key) {
  const value = required(args, key);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${key} must be true or false`);
}

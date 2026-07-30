#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  assertDesktopReleaseManifest,
  jsonFile,
  mergeReleaseCatalog,
} from "./release-support/desktop-release-metadata.mjs";

try {
  const args = parseArguments(process.argv.slice(2));
  const releasePath = path.resolve(required(args, "release"));
  const outputPath = path.resolve(required(args, "output"));
  const existingPath = option(args, "existing");
  const manifest = JSON.parse(await fs.readFile(releasePath, "utf8"));
  assertDesktopReleaseManifest(manifest);
  const existing = existingPath == null
    ? null
    : await readOptionalJson(path.resolve(existingPath));
  const allowedChannels = parseChannels(option(args, "channels"));
  const catalog = mergeReleaseCatalog(
    existing,
    manifest,
    option(args, "generated-at") ?? new Date().toISOString(),
    allowedChannels,
  );
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, jsonFile(catalog));
  console.log(`Catalog now contains ${catalog.releases.length} release(s); newest is ${catalog.releases[0]?.tag ?? "none"}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument near ${key ?? "end of input"}`);
    result.set(key.slice(2), value);
  }
  return result;
}

function required(args, key) {
  const value = option(args, key);
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
}

function option(args, key) {
  return args.get(key);
}

function parseChannels(value) {
  if (value == null) return null;
  const channels = value.split(",").map((channel) => channel.trim()).filter(Boolean);
  if (channels.length === 0) throw new Error("--channels must contain at least one channel");
  return channels;
}

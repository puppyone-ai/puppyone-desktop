#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  sha256File,
  verifyDesktopReleaseBundle,
} from "./release-support/desktop-release-metadata.mjs";

try {
  const args = parseArguments(process.argv.slice(2));
  const bundleDirectory = path.resolve(required(args, "bundle"));
  const urlPrefix = stripTrailingSlash(required(args, "url-prefix"));
  const includeAliases = booleanOption(args, "include-aliases", false);
  const includeMetadata = booleanOption(args, "include-metadata", false);
  const requestHeaders = createAuthorizationHeaders(process.env);
  const { manifest } = await verifyDesktopReleaseBundle(bundleDirectory);
  const expected = [];

  for (const asset of manifest.assets) {
    const localPath = path.join(bundleDirectory, "assets", asset.name);
    expected.push({ localPath, url: `${urlPrefix}/${encodeURIComponent(asset.name)}`, bytes: asset.bytes, sha256: asset.sha256 });
    if (includeAliases && asset.latestAlias) {
      expected.push({
        localPath,
        url: `${urlPrefix}/${encodeURIComponent(asset.latestAlias)}`,
        bytes: asset.bytes,
        sha256: asset.sha256,
      });
    }
  }
  if (includeMetadata) {
    for (const name of ["release.json", "SHA256SUMS", "build-info.json"]) {
      const localPath = path.join(bundleDirectory, name);
      const stats = await fs.stat(localPath).catch((error) => {
        if (error?.code === "ENOENT" && name === "build-info.json") return null;
        throw error;
      });
      if (!stats) continue;
      expected.push({
        localPath,
        url: `${urlPrefix}/${name}`,
        bytes: stats.size,
        sha256: await sha256File(localPath),
      });
    }
  }

  const failures = [];
  await mapWithConcurrency(expected, 3, async (entry) => {
    try {
      const actual = await hashRemote(entry.url, requestHeaders);
      if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) {
        throw new Error(
          `expected ${entry.bytes} bytes/${entry.sha256}, received ${actual.bytes} bytes/${actual.sha256}`,
        );
      }
      console.log(`Verified ${entry.url}`);
    } catch (error) {
      failures.push(`${entry.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (failures.length > 0) throw new Error(`Remote release verification failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function hashRemote(url, requestHeaders) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        // Internal verification may carry access credentials. A redirect must
        // fail instead of forwarding them beyond the configured origin.
        redirect: "error",
        headers: {
          "Cache-Control": "no-cache",
          "User-Agent": "puppyone-release-verifier/1",
          ...requestHeaders,
        },
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of response.body) {
        hash.update(chunk);
        bytes += chunk.byteLength;
      }
      return { bytes, sha256: hash.digest("hex") };
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

function createAuthorizationHeaders(environment) {
  const headers = {};
  if (environment.PUPPYONE_INTERNAL_RELEASE_TOKEN) {
    headers.Authorization = `Bearer ${environment.PUPPYONE_INTERNAL_RELEASE_TOKEN}`;
  }
  if (environment.CF_ACCESS_CLIENT_ID && environment.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = environment.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = environment.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

async function mapWithConcurrency(values, concurrency, task) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      await task(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
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
  const value = args.get(key);
  if (!value) throw new Error(`Missing required --${key}`);
  return value;
}

function booleanOption(args, key, fallback) {
  const value = args.get(key);
  if (value == null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${key} must be true or false`);
}

function stripTrailingSlash(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error("--url-prefix must be a credential-free HTTPS URL without query or fragment");
  }
  return url.href.replace(/\/+$/, "");
}

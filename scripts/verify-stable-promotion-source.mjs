#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertDesktopReleaseManifest,
  createChecksumsFile,
} from "./release-support/desktop-release-metadata.mjs";
import {
  assertStablePromotionCoordinates,
  selectStablePromotionSource,
} from "./release-support/stable-promotion-policy.mjs";
import { assertDesktopBuildInfo } from "../shared/desktop-build-identity.mjs";

try {
  const args = parseArguments(process.argv.slice(2));
  const catalogUrl = requireHttpsUrl(required(args, "catalog-url"), "catalog URL");
  const requestHeaders = createAuthorizationHeaders(process.env);
  const catalog = await readRemoteJson(catalogUrl, requestHeaders);
  const source = selectStablePromotionSource({
    catalog,
    baseVersion: required(args, "base-version"),
    commitSha: required(args, "commit"),
  });
  assertStablePromotionCoordinates({ source, catalogUrl });

  const immutableManifest = assertDesktopReleaseManifest(
    await readRemoteJson(source.r2.manifestUrl, requestHeaders),
  );
  if (canonicalJson(immutableManifest) !== canonicalJson(source)) {
    throw new Error("Canonical catalog entry does not match the immutable Internal release manifest.");
  }
  const checksums = await readRemoteText(source.r2.checksumsUrl, requestHeaders);
  if (checksums !== createChecksumsFile(source)) {
    throw new Error("Internal SHA256SUMS does not match the immutable release manifest.");
  }
  const buildInfo = assertDesktopBuildInfo(
    await readRemoteJson(source.r2.buildInfoUrl, requestHeaders),
  );
  if (
    buildInfo.version !== source.version
    || buildInfo.commitSha !== source.commitSha
    || buildInfo.buildId !== source.build.id
  ) {
    throw new Error("Internal build-info.json does not match the immutable release manifest.");
  }

  if (booleanOption(args, "verify-assets", true)) {
    await mapWithConcurrency(source.assets, 2, async (asset) => {
      const verified = await hashRemote(asset.r2.url, requestHeaders);
      if (verified.bytes !== asset.bytes || verified.sha256 !== asset.sha256) {
        throw new Error(
          `${asset.name} differs from Internal release evidence: `
          + `expected ${asset.bytes}/${asset.sha256}, received ${verified.bytes}/${verified.sha256}.`,
        );
      }
    });
  }

  const githubOutput = option(args, "github-output");
  if (githubOutput) {
    await fs.appendFile(path.resolve(githubOutput), [
      `promotion_manifest_url=${source.r2.manifestUrl}`,
      `promotion_source_tag=${source.tag}`,
      "",
    ].join("\n"));
  }
  console.log(`Verified Stable promotion source ${source.tag} at commit ${source.commitSha}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function createAuthorizationHeaders(environment) {
  const headers = {
    "Cache-Control": "no-cache",
    "User-Agent": "puppyone-stable-promotion-verifier/1",
  };
  if (environment.PUPPYONE_INTERNAL_RELEASE_TOKEN) {
    headers.Authorization = `Bearer ${environment.PUPPYONE_INTERNAL_RELEASE_TOKEN}`;
  }
  if (environment.CF_ACCESS_CLIENT_ID && environment.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = environment.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = environment.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

async function readRemoteJson(url, headers) {
  return JSON.parse(await readRemoteText(url, headers));
}

async function readRemoteText(url, headers) {
  const response = await fetchWithRetries(requireHttpsUrl(url, "release URL"), headers);
  return response.text();
}

async function hashRemote(url, headers) {
  const response = await fetchWithRetries(requireHttpsUrl(url, "asset URL"), headers);
  if (!response.body) throw new Error(`Release asset ${url} returned no response body.`);
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of response.body) {
    hash.update(chunk);
    bytes += chunk.byteLength;
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function fetchWithRetries(url, headers) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        // Authenticated Internal release reads must never forward credentials
        // through a redirect to a different origin.
        redirect: "error",
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
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
  await Promise.all(Array.from({ length: Math.min(values.length, concurrency) }, worker));
}

function requireHttpsUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} must be a credential-free HTTPS URL.`);
  }
  return url.href;
}

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value == null) {
      throw new Error(`Invalid promotion argument near ${key ?? "end of input"}.`);
    }
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

function booleanOption(args, key, fallback) {
  const value = option(args, key);
  if (value == null) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`--${key} must be true or false`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

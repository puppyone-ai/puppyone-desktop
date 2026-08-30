#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  assertDesktopLatestVersionIsHistoryHead,
  assertDesktopReleaseVersionAdvances,
  inspectDesktopReleaseHistory,
} from "./release-support/desktop-release-version-policy.mjs";

const DEFAULT_COORDINATES = Object.freeze({
  internal: Object.freeze({
    catalogUrl: "https://downloads.puppyone.ai/desktop/internal/catalog/releases.json",
    latestPointerUrl: "https://downloads.puppyone.ai/desktop/internal/mac/latest/latest.json",
  }),
  stable: Object.freeze({
    catalogUrl: "https://downloads.puppyone.ai/desktop/catalog/releases.json",
    latestPointerUrl: "https://downloads.puppyone.ai/desktop/stable/mac/latest/latest.json",
  }),
});

export function parseDesktopReleaseVersionArguments(argv) {
  const options = {
    candidateVersion: null,
    catalogUrl: null,
    channel: null,
    latestPointerUrl: null,
    requireLatestHistoryHead: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-latest-history-head") {
      options.requireLatestHistoryHead = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
    index += 1;
    if (argument === "--candidate-version") options.candidateVersion = value;
    else if (argument === "--catalog-url") options.catalogUrl = value;
    else if (argument === "--channel") options.channel = value;
    else if (argument === "--latest-pointer-url") options.latestPointerUrl = value;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.channel !== "internal" && options.channel !== "stable") {
    throw new Error("--channel must be internal or stable.");
  }
  if (!options.candidateVersion && !options.requireLatestHistoryHead) {
    throw new Error("Specify --candidate-version and/or --require-latest-history-head.");
  }
  const defaults = DEFAULT_COORDINATES[options.channel];
  return Object.freeze({
    ...options,
    catalogUrl: normalizeHttpsUrl(options.catalogUrl ?? defaults.catalogUrl, "catalog URL"),
    latestPointerUrl: normalizeHttpsUrl(
      options.latestPointerUrl ?? defaults.latestPointerUrl,
      "latest pointer URL",
    ),
  });
}

export async function runDesktopReleaseVersionVerifier(
  argv = process.argv.slice(2),
  { environment = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const options = parseDesktopReleaseVersionArguments(argv);
  const headers = createRequestHeaders(environment, options.channel);
  const [catalog, latestPointer] = await Promise.all([
    fetchJson(options.catalogUrl, fetchImpl, headers),
    fetchJson(options.latestPointerUrl, fetchImpl, headers),
  ]);
  let result = inspectDesktopReleaseHistory({
    channel: options.channel,
    latestPointer,
    catalog,
  });
  if (options.candidateVersion) {
    result = assertDesktopReleaseVersionAdvances({
      channel: options.channel,
      candidateVersion: options.candidateVersion,
      latestPointer,
      catalog,
    });
    console.log(
      `Verified ${options.channel} candidate ${result.candidateVersion} advances `
      + `published history ${result.highestPublishedVersion}.`,
    );
  }
  if (options.requireLatestHistoryHead) {
    result = assertDesktopLatestVersionIsHistoryHead({
      channel: options.channel,
      latestPointer,
      catalog,
    });
    console.log(
      `Verified ${options.channel} latest ${result.latestVersion} is the published history head.`,
    );
  }
  return result;
}

async function fetchJson(url, fetchImpl, headers) {
  if (typeof fetchImpl !== "function") throw new Error("Release version verification requires fetch.");
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

function createRequestHeaders(environment, channel) {
  const headers = {
    "Cache-Control": "no-cache",
    "User-Agent": "puppyone-desktop-release-version-verifier/1",
  };
  if (channel === "internal" && environment.PUPPYONE_INTERNAL_RELEASE_TOKEN) {
    headers.Authorization = `Bearer ${environment.PUPPYONE_INTERNAL_RELEASE_TOKEN}`;
  }
  if (
    channel === "internal"
    && environment.CF_ACCESS_CLIENT_ID
    && environment.CF_ACCESS_CLIENT_SECRET
  ) {
    headers["CF-Access-Client-Id"] = environment.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = environment.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

function normalizeHttpsUrl(value, label) {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(`${label} must be a credential-free HTTPS URL without query or fragment.`);
  }
  return url.href;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runDesktopReleaseVersionVerifier();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  verifyDesktopStableUpdateFeeds,
} from "./release-support/desktop-update-feed-verifier.mjs";

export function parseDesktopUpdateFeedVerifierArguments(argv) {
  const options = {
    expectedVersion: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== "--expected-version") {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--expected-version requires a value.");
    }
    options.expectedVersion = value;
    index += 1;
  }

  return Object.freeze(options);
}

export async function runDesktopUpdateFeedVerifier(argv = process.argv.slice(2)) {
  const options = parseDesktopUpdateFeedVerifierArguments(argv);
  const result = await verifyDesktopStableUpdateFeeds(options);

  console.log(`Verified PuppyOne Desktop Stable update contract for ${result.version}.`);
  console.log(`Latest pointer: ${result.latestPointerUrl}`);
  for (const report of result.reports) {
    console.log(`Update feed: ${report.metadataUrl} (${report.payloads.length} payloads)`);
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runDesktopUpdateFeedVerifier();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

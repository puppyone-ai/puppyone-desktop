#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureAccountPattern = /^(?:demo|example|me|private|test|tester|user)(?:[-_][a-z0-9]+)*$/i;
const homePathPatterns = [
  /\/Users\/([^/\s"'`]+)/g,
  /\/home\/([^/\s"'`]+)/g,
  /[A-Za-z]:[\\/]Users[\\/]([^\\/\s"'`]+)/g,
];
const hostOwnedPaths = [os.homedir(), repoRoot]
  .map((value) => path.resolve(value))
  .filter((value, index, values) => value && values.indexOf(value) === index);
const errors = [];

for (const filePath of collectTestSources(repoRoot)) {
  const source = readFileSync(filePath, "utf8");
  const relativePath = path.relative(repoRoot, filePath);

  for (const hostPath of hostOwnedPaths) {
    if (source.includes(hostPath)) {
      errors.push(`${relativePath} contains a host-owned absolute path`);
    }
  }

  for (const pattern of homePathPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      if (!fixtureAccountPattern.test(match[1])) {
        const line = source.slice(0, match.index).split("\n").length;
        errors.push(`${relativePath}:${line} contains a non-fixture home-directory account`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Test fixture privacy check failed:");
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  console.error("Replace host paths with an explicit fixture such as /Users/example or /home/test.");
  process.exit(1);
}

console.log("Test fixture privacy check passed.");

function collectTestSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") return [];
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTestSources(filePath);
    if (!entry.isFile()) return [];
    const relativePath = path.relative(repoRoot, filePath);
    return isTestSource(relativePath) ? [filePath] : [];
  });
}

function isTestSource(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (normalized === "scripts/check-test-fixture-privacy.mjs") return false;
  return normalized.startsWith("tests/")
    || normalized.startsWith("benchmarks/")
    || normalized.includes("/__tests__/")
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized)
    || normalized.endsWith(".snap")
    || normalized === "scripts/native-agent-roundtrip-runner.mjs"
    || /^scripts\/native-agent-(?:reference-smoke-(?:fixtures|runner)|smoke-runtime-selection)\.mjs$/.test(normalized)
    || /^scripts\/(?:smoke|audit|run-.*(?:test|smoke)|.*(?:test|e2e))[^/]*\.[cm]?js$/.test(normalized);
}

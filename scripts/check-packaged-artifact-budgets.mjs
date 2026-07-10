#!/usr/bin/env node
/**
 * Packaged-artifact budget gate for Viewer Packs.
 *
 * Ensures on-demand Viewer Pack payloads are NOT shipped inside the base
 * renderer `dist/` tree. When a packaged Electron artifact directory is
 * present, also asserts that viewer-pack store content is absent from the
 * base app payload (packs live under userData after install).
 *
 * Safe to run in CI when artifacts are missing — exits 0 with a skip notice.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repoRoot, "dist");
const releaseDir = path.join(repoRoot, "release");

const FORBIDDEN_DIST_PATTERNS = [
  /viewer-packs\//i,
  /\.puppyplugin$/i,
  /ai\.puppyone\.viewer\./i,
];

function walk(dir, relative = "") {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, nextRelative));
    else if (entry.isFile()) out.push({ relative: nextRelative, size: statSync(abs).size });
  }
  return out;
}

const errors = [];

if (existsSync(distDir)) {
  const files = walk(distDir);
  for (const file of files) {
    if (FORBIDDEN_DIST_PATTERNS.some((pattern) => pattern.test(file.relative))) {
      errors.push(`base dist must not contain on-demand viewer pack payload: ${file.relative}`);
    }
  }
  // Soft budget: renderer assets should not suddenly include a 3D runtime.
  const entryChunks = files.filter((file) => /^assets\/index-.+\.js$/.test(file.relative));
  for (const chunk of entryChunks) {
    if (chunk.size > 2_100_000) {
      errors.push(`${chunk.relative} exceeds entry budget (${chunk.size} bytes)`);
    }
  }
} else {
  console.log("packaged artifact budget: dist/ missing — skipped renderer checks");
}

if (existsSync(releaseDir)) {
  const files = walk(releaseDir);
  for (const file of files) {
    if (/\.puppyplugin$/i.test(file.relative) || /viewer-packs\/packages\//i.test(file.relative)) {
      errors.push(`release artifact must not embed installed viewer packs: ${file.relative}`);
    }
  }
} else {
  console.log("packaged artifact budget: release/ missing — skipped package checks");
}

if (errors.length > 0) {
  console.error("packaged artifact budget check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("packaged artifact budget check passed.");

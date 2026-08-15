#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const publicRoot = path.join(repoRoot, "public");
const rootRelativeAssetPattern = /(["'`])\/(?!\/)[^"'`]+\.(?:png|svg|webp|jpe?g|gif|ico|woff2?)(?:[?#][^"'`]*)?\1/gi;
const rendererAssetCallPattern = /resolveRendererPublicAssetUrl\(\s*(["'`])([^"'`]+)\1\s*\)/g;
const cssPublicAssetPattern = /url\(\s*(["']?)\/(?!\/)([^"')]+\.(?:png|svg|webp|jpe?g|gif|ico|woff2?))\1\s*\)/gi;
const errors = [];

for (const filePath of walk(distRoot)) {
  if (!/\.(?:html|[cm]?js)$/.test(filePath)) continue;
  const source = readFileSync(filePath, "utf8");
  const matches = source.match(rootRelativeAssetPattern) ?? [];
  if (matches.length > 0) {
    errors.push(`${path.relative(repoRoot, filePath)} contains ${matches.join(", ")}`);
  }
}

const rendererSourceRoots = [
  path.join(repoRoot, "src"),
  path.join(repoRoot, "packages", "shared-ui", "src"),
];

for (const filePath of rendererSourceRoots.flatMap(walk)) {
  if (!/\.(?:css|[cm]?[jt]sx?)$/.test(filePath)) continue;
  const source = readFileSync(filePath, "utf8");
  const assetPaths = filePath.endsWith(".css")
    ? [...source.matchAll(cssPublicAssetPattern)].map((match) => match[2])
    : [...source.matchAll(rendererAssetCallPattern)].map((match) => match[2]);

  for (const assetPath of assetPaths) {
    if (!existsSync(path.join(publicRoot, assetPath))) {
      errors.push(`${path.relative(repoRoot, filePath)} references missing public/${assetPath}`);
    }
    if (!existsSync(path.join(distRoot, assetPath))) {
      errors.push(`${path.relative(repoRoot, filePath)} references missing dist/${assetPath}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Renderer public asset check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Renderer public asset check passed.");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  });
}

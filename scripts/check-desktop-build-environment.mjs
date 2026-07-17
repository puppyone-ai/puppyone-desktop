#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { inspectDesktopBuildEnvironment } from "./desktop-build-environment.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.env.NODE_ENV === "development" ? "development" : "production";
const environment = {
  ...loadEnv(mode, repoRoot, ""),
  ...process.env,
};
const errors = inspectDesktopBuildEnvironment(environment);

if (errors.length > 0) {
  console.error("Desktop build environment check failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Configure .env.local from .env.example or set the variables in CI.");
  process.exit(1);
}

console.log("Desktop build environment check passed.");

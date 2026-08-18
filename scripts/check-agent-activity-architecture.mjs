#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const providers = ["codex", "claude", "cursor", "opencode", "pi", "hermes"];

checkTree("shared/agent-activity-contract", [
  /(?:^|["'])electron(?:["'/]|$)/u,
  /(?:^|["'])react(?:["'/]|$)/u,
  /tool_input|hook_event_name|PreToolUse/u,
], "shared contract contains native/provider or UI code");

checkTree("electron/main/agent-activity", [
  /terminal-agent\/activity\/adapters/u,
  /(?:codex|claude|cursor|opencode|hermes)ActivityAdapter/u,
], "neutral broker imports a concrete Terminal provider");

checkTree("src/features/desktop-agent-presence", [
  /desktop-terminal/u,
  /terminal-agent\/activity/u,
  /tool_input|hook_event_name|PreToolUse/u,
], "Renderer presence imports Terminal/provider internals");

for (const provider of providers) {
  requirePath(`electron/main/terminal-agent/activity/adapters/${provider}/descriptor.mjs`);
}

const registry = read("electron/main/terminal-agent/activity/terminal-agent-activity-adapter-registry.mjs");
for (const provider of providers) {
  if (!registry.includes(`./adapters/${provider}/descriptor.mjs`)) {
    errors.push(`adapter registry is missing ${provider}`);
  }
}

for (const filePath of sourceFiles(path.join(root, "src", "features", "editor-workbench"))) {
  const source = readFileSync(filePath, "utf8");
  if (/terminal-agent\/activity|hook_event_name|tool_input/u.test(source)) {
    errors.push(`${relative(filePath)} bypasses the public presence feature`);
  }
}

requirePath("src/features/settings/main/AgentPortalSettingsView.tsx");
const generalSettings = read("src/features/settings/main/GeneralSettingsView.tsx");
if (/AgentActivity|agentPortal/u.test(generalSettings)) {
  errors.push("General Settings must not own Agent activity enrollment");
}

const agentPortalSettings = read("src/features/settings/main/AgentPortalSettingsView.tsx");
if (!agentPortalSettings.includes("provider.displayName")
    || !agentPortalSettings.includes("desktop-settings-switch")) {
  errors.push("Agent Portal must use the compact provider-name and control row contract");
}
if (/desktop-settings-label-stack|<small>/u.test(agentPortalSettings)) {
  errors.push("Agent Portal provider rows must not render descriptive copy");
}

const settingsModel = read("src/features/settings/sidebar/settingsSidebarModel.ts");
const desktopAppGroup = settingsModel.slice(
  settingsModel.indexOf('id: "desktop-app"'),
  settingsModel.indexOf('id: "local-project"'),
);
if (!desktopAppGroup.includes('id: "agent-portal"')) {
  errors.push("Agent Portal must remain a first-class Desktop App settings page");
}

if (errors.length > 0) {
  console.error("Agent activity architecture check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Agent activity architecture OK: neutral broker, six edge adapters, public Renderer boundary.");

function checkTree(relativeDirectory, patterns, message) {
  for (const filePath of sourceFiles(path.join(root, relativeDirectory))) {
    const source = readFileSync(filePath, "utf8");
    if (patterns.some((pattern) => pattern.test(source))) {
      errors.push(`${relative(filePath)}: ${message}`);
    }
  }
}

function requirePath(relativePath) {
  if (!existsSync(path.join(root, relativePath))) errors.push(`required file is missing: ${relativePath}`);
}

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) yield* sourceFiles(filePath);
    else if (/\.(?:mjs|ts|tsx)$/u.test(entry)) yield filePath;
  }
}

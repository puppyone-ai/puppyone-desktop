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

requirePath("src/features/local-agents/ui/LocalAgentsSettingsView.tsx");
requirePath("src/features/desktop-agent-presence/ui/AgentFileActivityAppearanceSetting.tsx");
requirePath("src/features/desktop-agent-presence/ui/AgentFileActivityPermissionDialog.tsx");
requirePath("docs/architecture/desktop-agent/local-agents-and-file-activity.md");
const generalSettings = read("src/features/settings/main/GeneralSettingsView.tsx");
if (/AgentActivity|agentFileActivity|localAgents/u.test(generalSettings)) {
  errors.push("General Settings must not own Agent activity enrollment");
}

const localAgentsSettings = read("src/features/local-agents/ui/LocalAgentsSettingsView.tsx");
if (!localAgentsSettings.includes("connection.displayName")
    || !localAgentsSettings.includes("desktop-settings-switch")
    || !localAgentsSettings.includes("discoverLocalAgents")) {
  errors.push("Local Agents must use the native inventory and compact selection row contract");
}
if (/desktop-settings-label-stack|<small>|AgentActivity|agentFileActivity|Hook/u.test(localAgentsSettings)) {
  errors.push("Local Agents must not own appearance, Hook enrollment, or descriptive row copy");
}

const settingsModel = read("src/features/settings/sidebar/settingsSidebarModel.ts");
const desktopAppGroup = settingsModel.slice(
  settingsModel.indexOf('id: "desktop-app"'),
  settingsModel.indexOf('id: "local-project"'),
);
if (!desktopAppGroup.includes('id: "local-agents"')) {
  errors.push("Local Agents must remain a first-class Desktop App settings page");
}

const settingsView = read("src/features/settings/SettingsView.tsx");
if (!settingsView.includes("<AgentFileActivityAppearanceSetting")) {
  errors.push("Agent file activity visibility must remain in Appearance");
}

const activityAppearanceSetting = read("src/features/desktop-agent-presence/ui/AgentFileActivityAppearanceSetting.tsx");
const enableReconcileIndex = activityAppearanceSetting.indexOf("await reconcileNativeActivityHooks({ enabled: true");
const enablePreferenceIndex = activityAppearanceSetting.indexOf("onChange(true)", enableReconcileIndex);
if (!activityAppearanceSetting.includes("<AgentFileActivityPermissionDialog")
    || !activityAppearanceSetting.includes("setPermissionOpen(true)")) {
  errors.push("Agent file activity opt-in must open the shared one-step permission dialog");
}
if (enableReconcileIndex < 0 || enablePreferenceIndex < enableReconcileIndex) {
  errors.push("Agent file activity must enroll native Hooks before enabling its visual preference");
}

const activityPermissionDialog = read("src/features/desktop-agent-presence/ui/AgentFileActivityPermissionDialog.tsx");
if (!activityPermissionDialog.includes("DesktopDialogRoot")
    || !activityPermissionDialog.includes("permission.accessTitle")) {
  errors.push("Agent file activity permission must use the shared dialog and concise access summary");
}
if (/providerId|providers\.map|connection\.displayName|desktop-settings-switch/u.test(activityPermissionDialog)) {
  errors.push("Agent file activity permission must remain one batch action, not per-Agent controls");
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

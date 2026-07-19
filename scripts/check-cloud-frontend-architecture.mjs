#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const retiredFiles = [
  "src/features/cloud/styles/overview.css",
  "src/features/cloud/styles/settings-page.css",
  "src/features/cloud/styles/access.css",
  "src/features/cloud/styles/browser-common.css",
  "src/features/cloud/styles/project-browser.css",
  "src/features/cloud/styles/template-store.css",
  "src/features/cloud/styles/global-pages.css",
  "src/features/cloud/styles/panel-auth.css",
  "src/features/cloud/styles/methods-sync.css",
  "src/features/cloud/sections/OverviewSection.tsx",
  "src/features/cloud/sections/SettingsSection.tsx",
  "src/features/cloud/sections/BranchesSection.tsx",
  "src/features/cloud/sections/overview/styles/deployment-board.css",
  "src/features/cloud/sections/overview/styles/metric-rail.css",
  "src/features/cloud/history/HistoryGraphVisual.tsx",
];
for (const relativePath of retiredFiles) {
  if (existsSync(resolve(relativePath))) {
    errors.push(`${relativePath} is retired; page assets must stay with their owning section`);
  }
}

const lineBudgets = new Map([
  ["src/features/cloud/CloudServiceMainView.tsx", 340],
  ["src/features/cloud/routes/CloudRouter.tsx", 170],
  ["src/features/cloud/routes/CloudProjectRouteOutlet.tsx", 260],
  ["src/features/cloud/initialization/CloudInitializationView.tsx", 450],
  ["src/features/cloud/components/shared.css", 450],
  ["src/features/cloud/components/project-browser.css", 220],
  ["src/features/cloud/components/template-store.css", 650],
  ["src/features/cloud/components/global-pages.css", 900],
  ["src/features/cloud/CloudServicePanel.css", 700],
  ["src/features/cloud/sections/methods-sync.css", 400],
  ["src/features/cloud/components/web-page.css", 450],
  ["src/features/cloud/sections/branches/branches.css", 550],
  ["src/features/cloud/styles/primitives.css", 250],
  ["src/features/cloud/initialization/initialization.css", 900],
  ["src/features/cloud/graph/HistoryGraphVisual.tsx", 150],
  ["src/features/cloud/graph/graph.css", 80],
  ["src/features/cloud/sections/overview/OverviewDashboard.tsx", 280],
  ["src/features/cloud/sections/overview/OverviewHistoryPreview.tsx", 130],
  ["src/features/cloud/sections/overview/overview.css", 10],
  ["src/features/cloud/sections/overview/styles/base.css", 180],
  ["src/features/cloud/sections/overview/styles/project-identity.css", 80],
  ["src/features/cloud/sections/overview/styles/dashboard-grid.css", 180],
  ["src/features/cloud/sections/overview/styles/history-card.css", 100],
  ["src/features/cloud/sections/overview/styles/access-card.css", 100],
  ["src/features/cloud/sections/overview/styles/resource-cards.css", 80],
  ["src/features/cloud/sections/overview/styles/responsive.css", 150],
  ["src/features/cloud/sections/settings/settings.css", 700],
]);
for (const [relativePath, maximumLines] of lineBudgets) {
  const source = read(relativePath);
  const lines = source.split(/\r?\n/).length;
  if (lines > maximumLines) {
    errors.push(`${relativePath} has ${lines} lines; its architecture budget is ${maximumLines}`);
  }
}

const cloudStyleEntry = read("src/features/cloud/cloud-service.css");
if (!cloudStyleEntry.includes('@import "./styles/primitives.css";')) {
  errors.push("Cloud shared presentation primitives must be loaded by cloud-service.css");
}
for (const forbiddenImport of ["styles/overview.css", "styles/settings-page.css"]) {
  if (cloudStyleEntry.includes(forbiddenImport)) {
    errors.push(`cloud-service.css reintroduced page-owned import ${forbiddenImport}`);
  }
}

const pageStyleOwners = [
  ["src/features/cloud/sections/overview/OverviewSection.tsx", 'import "./overview.css";'],
  ["src/features/cloud/sections/settings/SettingsSection.tsx", 'import "./settings.css";'],
  ["src/features/cloud/sections/access/AccessSection.tsx", 'import "./access.css";'],
  ["src/features/cloud/DesktopCloudAccessView.tsx", 'import "./sections/access/access.css";'],
  ["src/features/cloud/components/shared.tsx", 'import "./shared.css";'],
  ["src/features/cloud/components/ProjectBrowser.tsx", 'import "./project-browser.css";'],
  ["src/features/cloud/components/CloudTemplateStore.tsx", 'import "./template-store.css";'],
  ["src/features/cloud/components/CloudGlobalPages.tsx", 'import "./global-pages.css";'],
  ["src/features/cloud/components/CloudBillingPage.tsx", 'import "./global-pages.css";'],
  ["src/features/cloud/CloudServicePanel.tsx", 'import "./CloudServicePanel.css";'],
  ["src/features/cloud/sections/McpCliSection.tsx", 'import "./methods-sync.css";'],
  ["src/features/cloud/sections/GitSyncSection.tsx", 'import "./methods-sync.css";'],
  ["src/features/cloud/history/CloudHistoryView.tsx", 'import "./history.css";'],
  ["src/features/cloud/components/shared.tsx", 'import "./web-page.css";'],
  ["src/features/cloud/sections/branches/BranchesSection.tsx", 'import "./branches.css";'],
  ["src/features/cloud/initialization/CloudInitializationView.tsx", 'import "./initialization.css";'],
];
for (const [relativePath, requiredImport] of pageStyleOwners) {
  if (!read(relativePath).includes(requiredImport)) {
    errors.push(`${relativePath} must import its owned stylesheet directly`);
  }
}

for (const relativePath of [
  "src/features/cloud/sections/settings/settings.css",
  "src/features/cloud/initialization/initialization.css",
  "src/features/cloud/components/shared.css",
  "src/features/cloud/components/project-browser.css",
  "src/features/cloud/components/template-store.css",
  "src/features/cloud/components/global-pages.css",
  "src/features/cloud/CloudServicePanel.css",
  "src/features/cloud/sections/methods-sync.css",
  "src/features/cloud/components/web-page.css",
  "src/features/cloud/sections/branches/branches.css",
]) {
  if (!read(relativePath).includes("@layer features {")) {
    errors.push(`${relativePath} must keep component-owned CSS inside the registered features layer`);
  }
}
const accessStyleManifest = read("src/features/cloud/sections/access/access.css");
if (!/@import\s+"\.\/styles\/[^\"]+"\s+layer\(features\);/.test(accessStyleManifest)) {
  errors.push("Access component styles must be imported into the registered features layer");
}
const overviewStyleManifest = read("src/features/cloud/sections/overview/overview.css");
const expectedOverviewStyleManifest = [
  '@import "./styles/base.css" layer(features);',
  '@import "./styles/project-identity.css" layer(features);',
  '@import "./styles/dashboard-grid.css" layer(features);',
  '@import "../../graph/graph.css" layer(features);',
  '@import "./styles/history-card.css" layer(features);',
  '@import "./styles/access-card.css" layer(features);',
  '@import "./styles/resource-cards.css" layer(features);',
  '@import "./styles/responsive.css" layer(features);',
].join("\n");
if (overviewStyleManifest.trim() !== expectedOverviewStyleManifest) {
  errors.push("Overview component styles must keep their layered manifest in semantic render order");
}
const overviewDashboardSource = read("src/features/cloud/sections/overview/OverviewDashboard.tsx");
const overviewLiteralClassTokens = [...overviewDashboardSource.matchAll(/className="([^"]+)"/g)]
  .flatMap((match) => match[1].split(/\s+/));
for (const forbiddenClassToken of ["compact", "interactive", "history", "access", "automation", "storage"]) {
  if (overviewLiteralClassTokens.includes(forbiddenClassToken)) {
    errors.push(`Overview dashboard modifier ${forbiddenClassToken} must use a desktop-cloud-overview namespace`);
  }
}
if (/^\.compact\s*\{/m.test(read("src/features/cloud/legacy-sidebar.css"))) {
  errors.push("legacy-sidebar.css must not expose the global .compact utility");
}
const historyStyleManifest = read("src/features/cloud/history/history.css");
if (!/@import\s+"\.\/styles\/[^\"]+"\s+layer\(features\);/.test(historyStyleManifest)) {
  errors.push("History component styles must be imported into the registered features layer");
}

const routeDefinitions = read("src/features/cloud/routes/cloudRoutes.ts");
for (const requiredRouteContract of [
  "surface: CloudRouteSurface",
  "resources: readonly CloudProjectDetailResource[]",
  "getCloudProjectDetailResources",
  "getCloudRouteSurface",
]) {
  if (!routeDefinitions.includes(requiredRouteContract)) {
    errors.push(`Cloud route descriptors are missing ${requiredRouteContract}`);
  }
}

const mainView = read("src/features/cloud/CloudServiceMainView.tsx");
if (
  !mainView.includes("getCloudProjectDetailResources")
  || !mainView.includes("getCloudRouteSurface")
  || mainView.includes("function getCloudProjectDetailResources")
) {
  errors.push("CloudServiceMainView must consume route resource/surface declarations without owning them");
}

const cloudRouter = read("src/features/cloud/routes/CloudRouter.tsx");
for (const requiredOutlet of ["CloudGlobalRouteOutlet", "CloudProjectRouteOutlet"]) {
  if (!cloudRouter.includes(requiredOutlet)) {
    errors.push(`CloudRouter must delegate through ${requiredOutlet}`);
  }
}
if (cloudRouter.includes("../sections/") || cloudRouter.includes("CloudProjectBrowser")) {
  errors.push("CloudRouter must remain an orchestration boundary, not a page implementation");
}

const stateBarrel = read("src/features/cloud/states.tsx");
if (/\b(?:function|const|class)\s+Cloud/.test(stateBarrel)) {
  errors.push("src/features/cloud/states.tsx must remain a compatibility barrel only");
}

const panelAuthStyles = read("src/features/cloud/CloudServicePanel.css");
if (/desktop-cloud-(?:overview|access|sync|web-|repo-|home-|authority|usage)/.test(panelAuthStyles)) {
  errors.push("panel-auth.css must not own responsive rules for unrelated Cloud pages");
}

const retiredSelectors = [
  "desktop-cloud-overview-focus",
  "desktop-cloud-overview-header",
  "desktop-cloud-overview-title-row",
  "desktop-cloud-overview-body",
  "desktop-cloud-overview-side",
  "desktop-cloud-project-overview",
  "desktop-cloud-hosted-source",
  "desktop-cloud-repo-hero",
  "desktop-cloud-repo-copy",
  "desktop-cloud-repo-title-row",
  "desktop-cloud-local-map",
  "desktop-cloud-authority-grid",
  "desktop-cloud-sync-summary",
  "desktop-cloud-usage-grid",
];
const cloudCss = walkCss(resolve("src/features/cloud"))
  .map((filePath) => readAbsolute(filePath))
  .join("\n");
for (const selector of retiredSelectors) {
  if (cloudCss.includes(selector)) {
    errors.push(`retired Cloud selector remains in the stylesheet graph: ${selector}`);
  }
}

const rendererSource = walkFiles(resolve("src"))
  .filter((filePath) => /\.(?:ts|tsx|js|jsx|html)$/.test(filePath))
  .map((filePath) => readAbsolute(filePath))
  .join("\n");
const cloudClassNames = new Set(
  [...cloudCss.matchAll(/\.((?:desktop-cloud)-[a-z0-9-]+)/g)].map((match) => match[1]),
);
for (const className of cloudClassNames) {
  if (!rendererSource.includes(className)) {
    errors.push(`Cloud CSS class has no renderer owner: ${className}`);
  }
}

for (const filePath of walkCss(resolve("src/features/cloud/sections/access/styles"))) {
  const lines = readAbsolute(filePath).split(/\r?\n/).length;
  if (lines > 800) {
    errors.push(`${path.relative(repoRoot, filePath)} has ${lines} lines; split Access styles by component`);
  }
}

if (errors.length > 0) {
  console.error("Cloud frontend architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Cloud frontend architecture check passed.");

function resolve(relativePath) {
  return path.join(repoRoot, relativePath);
}

function read(relativePath) {
  const filePath = resolve(relativePath);
  if (!existsSync(filePath)) {
    errors.push(`required Cloud architecture file is missing: ${relativePath}`);
    return "";
  }
  return readAbsolute(filePath);
}

function readAbsolute(filePath) {
  return readFileSync(filePath, "utf8");
}

function walkCss(directory) {
  return walkFiles(directory).filter((filePath) => filePath.endsWith(".css"));
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(filePath);
    return [filePath];
  });
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainRoot = path.join(repoRoot, "electron", "main", "agent");
const mainRuntimeRoot = path.join(mainRoot, "runtime");
const mainDomainRoot = path.join(mainRoot, "domain");
const mainApplicationRoot = path.join(mainRoot, "application");
const mainConcreteRoots = [
  path.join(mainRoot, "adapters"),
  path.join(mainRoot, "runtimes"),
  path.join(mainRoot, "connections"),
  path.join(mainRoot, "bootstrap"),
];
const rendererRoot = path.join(repoRoot, "src", "features", "desktop-agent");
const rendererDomainRoot = path.join(rendererRoot, "domain");
const rendererApplicationRoot = path.join(rendererRoot, "application");
const rendererInfrastructureRoot = path.join(rendererRoot, "infrastructure");
const rendererUiRoot = path.join(rendererRoot, "ui");
const rendererCompositionRoot = path.join(rendererUiRoot, "RightAgentPanel.tsx");
const electronAgentClient = path.join(rendererInfrastructureRoot, "electron", "electronAgentClient.ts");
const sharedContractRoot = path.join(repoRoot, "shared", "agent-contract");
const allowedCompositionRoot = path.join(mainRoot, "bootstrap", "create-agent-runtime-host.mjs");
const allowedProviderNamedCoreFiles = new Set([
  path.join(mainRoot, "migrations", "legacy-session-format.mjs"),
]);
const legacyPresentationPaths = [
  "AgentActivityItem.tsx",
  "AgentApprovalDock.tsx",
  "AgentComposer.tsx",
  "AgentControls.tsx",
  "AgentMessage.tsx",
  "AgentPlanItem.tsx",
  "AgentSurfaceHeader.tsx",
  "AgentTranscript.tsx",
  "RightAgentPanel.tsx",
  "components",
  "desktop-agent.css",
].map((entry) => path.join(rendererRoot, entry));
const importPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const providerNamePattern = /\b(?:opencode|codex|claude(?:\s+code)?|cursor\s+(?:cli|runtime))\b/i;
const errors = [];

for (const legacyPath of legacyPresentationPaths) {
  if (existsSync(legacyPath)) errors.push(`${relative(legacyPath)} is a legacy presentation location; use ui/`);
}

for (const filePath of walkSourceFiles(mainRoot)) {
  const source = readFileSync(filePath, "utf8");
  const targets = collectSpecifiers(source).map((specifier) => ({ specifier, target: resolveRelativeModule(filePath, specifier) }));
  for (const { specifier, target } of targets) {
    if (!target) continue;
    if (isInside(filePath, mainRuntimeRoot) && mainConcreteRoots.some((root) => isInsideOrSame(target, root))) {
      errors.push(`${relative(filePath)} imports concrete runtime ${relative(target)}; runtime/ must remain provider-neutral`);
    }
    if (isInside(filePath, mainDomainRoot) && (
      isInsideOrSame(target, mainApplicationRoot)
      || mainConcreteRoots.some((root) => isInsideOrSame(target, root))
      || relative(target).startsWith("electron/main/ipc/")
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; main domain cannot depend on application/infrastructure`);
    }
    if (isInside(filePath, mainApplicationRoot) && (
      mainConcreteRoots.some((root) => isInsideOrSame(target, root))
      || relative(target).startsWith("electron/main/ipc/")
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; main application must depend on ports, not concrete runtimes/IPC`);
    }
    if (filePath !== allowedCompositionRoot && isInsideOrSame(target, path.join(mainRoot, "bootstrap"))) {
      errors.push(`${relative(filePath)} imports the composition root; bootstrap is an entrypoint only`);
    }
    if (specifier === "react" || specifier.startsWith("react/")) {
      errors.push(`${relative(filePath)} imports React; Electron Agent main must remain presentation-free`);
    }
  }
  if (
    !mainConcreteRoots.some((root) => isInsideOrSame(filePath, root))
    && !allowedProviderNamedCoreFiles.has(filePath)
    && providerNamePattern.test(stripComments(source))
  ) {
    errors.push(`${relative(filePath)} names a concrete runtime outside a runtime implementation, composition root, or migration edge`);
  }
}

for (const filePath of walkSourceFiles(rendererRoot)) {
  const source = readFileSync(filePath, "utf8");
  for (const specifier of collectSpecifiers(source)) {
    const target = resolveRelativeModule(filePath, specifier);
    if (isInside(filePath, rendererDomainRoot) && target && (
      isInsideOrSame(target, rendererApplicationRoot)
      || isInsideOrSame(target, rendererInfrastructureRoot)
      || isInsideOrSame(target, rendererUiRoot)
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; renderer domain is the dependency floor`);
    }
    if (isInside(filePath, rendererApplicationRoot) && target && (
      isInsideOrSame(target, rendererInfrastructureRoot) || isInsideOrSame(target, rendererUiRoot)
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; renderer application must depend on ports, not infrastructure/UI`);
    }
    if (isInside(filePath, rendererApplicationRoot) && (specifier === "react" || specifier.startsWith("react/"))) {
      errors.push(`${relative(filePath)} imports React; Agent application services must remain framework-independent`);
    }
    if (isInside(filePath, rendererUiRoot) && target && relative(target).startsWith("electron/")) {
      errors.push(`${relative(filePath)} imports Electron main ${relative(target)}; UI must use the typed bridge`);
    }
    if (
      isInside(filePath, rendererUiRoot)
      && filePath !== rendererCompositionRoot
      && target
      && isInsideOrSame(target, rendererInfrastructureRoot)
    ) {
      errors.push(`${relative(filePath)} imports infrastructure; only RightAgentPanel may compose the Electron adapter`);
    }
    if (isInside(filePath, rendererInfrastructureRoot) && target && isInsideOrSame(target, rendererUiRoot)) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; renderer infrastructure cannot depend on UI`);
    }
  }
  if (isInsideOrSame(filePath, rendererApplicationRoot) && /\b(?:window|document|navigator)\s*\./.test(stripComments(source))) {
    errors.push(`${relative(filePath)} accesses browser globals; application services must use explicit ports`);
  }
  if (filePath !== electronAgentClient && /\bpuppyoneDesktop\b/.test(stripComments(source))) {
    errors.push(`${relative(filePath)} reads the preload bridge; use infrastructure/electron/electronAgentClient.ts`);
  }
  if (!isInside(filePath, rendererUiRoot) && /\b(?:JSX\.|ReactNode|<section\b|<div\b)/.test(stripComments(source))) {
    if (!filePath.endsWith("index.ts")) errors.push(`${relative(filePath)} contains presentation outside ui/`);
  }
  if (
    !isInsideOrSame(filePath, rendererUiRoot)
    && providerNamePattern.test(stripComments(source))
  ) {
    errors.push(`${relative(filePath)} names a concrete runtime; Renderer domain/application must be provider-neutral`);
  }
}

const agentStyleRoot = path.join(rendererUiRoot, "styles");
const agentStyleEntry = path.join(rendererUiRoot, "desktop-agent.css");
const styleEntrySource = readFileSync(agentStyleEntry, "utf8");
if (styleEntrySource.split("\n").length > 30 || !styleEntrySource.includes('@import "./styles/')) {
  errors.push("src/features/desktop-agent/ui/desktop-agent.css must remain an import-only public style entry");
}
for (const entry of readdirSync(agentStyleRoot)) {
  if (!entry.endsWith(".css")) continue;
  const stylePath = path.join(agentStyleRoot, entry);
  const lineCount = readFileSync(stylePath, "utf8").split("\n").length;
  if (lineCount > 450) errors.push(`${relative(stylePath)} has ${lineCount} lines; split styles at a responsibility boundary`);
}

const responsibilityBudgets = [
  [path.join(mainRoot, "agent-service.mjs"), 850],
  [path.join(rendererApplicationRoot, "AgentSessionController.ts"), 500],
  [path.join(rendererDomainRoot, "agent-projection.ts"), 550],
  [path.join(rendererUiRoot, "RightAgentPanel.tsx"), 230],
];
for (const [filePath, maximumLines] of responsibilityBudgets) {
  const lineCount = readFileSync(filePath, "utf8").split("\n").length;
  if (lineCount > maximumLines) {
    errors.push(`${relative(filePath)} has ${lineCount} lines; its orchestrator/reducer responsibility budget is ${maximumLines}`);
  }
}

for (const filePath of walkSourceFiles(sharedContractRoot)) {
  const source = readFileSync(filePath, "utf8");
  for (const specifier of collectSpecifiers(source)) {
    if (specifier === "react" || specifier === "electron" || specifier.startsWith("electron/")) {
      errors.push(`${relative(filePath)} imports ${specifier}; shared Agent contracts must stay process-neutral`);
    }
  }
}

for (const filePath of walkSourceFiles(path.join(repoRoot, "src"))) {
  if (isInsideOrSame(filePath, rendererRoot)) continue;
  const source = readFileSync(filePath, "utf8");
  for (const specifier of collectSpecifiers(source)) {
    if (/features\/desktop-agent\/(?!index(?:\.|$)|visual-smoke(?:\.|$))/.test(specifier)) {
      errors.push(`${relative(filePath)} deep-imports ${specifier}; consume the feature public index`);
    }
  }
}

const registrySource = readFileSync(path.join(mainRuntimeRoot, "agent-runtime-registry.mjs"), "utf8");
if (/\b(?:opencode|codex|claude|cursor)\b/i.test(stripComments(registrySource))) {
  errors.push("electron/main/agent/runtime/agent-runtime-registry.mjs names a concrete provider");
}

if (errors.length > 0) {
  console.error("Desktop Agent architecture boundary check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Desktop Agent architecture boundary check passed.");

function* walkSourceFiles(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) yield* walkSourceFiles(filePath);
    else if (/\.(?:mjs|cjs|ts|tsx)$/.test(filePath)) yield filePath;
  }
}

function collectSpecifiers(source) {
  const specifiers = [];
  for (const pattern of [importPattern, dynamicImportPattern]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match) {
      specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return specifiers;
}

function resolveRelativeModule(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  for (const suffix of ["", ".mjs", ".cjs", ".ts", ".tsx", "/index.mjs", "/index.ts", "/index.tsx"]) {
    const candidate = `${base}${suffix}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function isInside(target, directory) {
  return target !== directory && isInsideOrSame(target, directory);
}

function isInsideOrSame(target, directory) {
  const value = path.relative(directory, target);
  return value === "" || (!value.startsWith("..") && !path.isAbsolute(value));
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

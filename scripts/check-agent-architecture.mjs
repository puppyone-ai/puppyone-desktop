import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainRoot = path.join(repoRoot, "electron", "main", "agent");
const mainRuntimeRoot = path.join(mainRoot, "runtime");
const mainDomainRoot = path.join(mainRoot, "domain");
const mainApplicationRoot = path.join(mainRoot, "application");
const mainProtocolRoot = path.join(mainRoot, "protocols");
const mainSecurityRoot = path.join(mainRoot, "security");
const mainTransportRoot = path.join(mainRoot, "transports");
const mainRuntimesRoot = path.join(mainRoot, "runtimes");
const mainCacheRoot = path.join(mainRoot, "cache");
const mainConcreteRoots = [
  path.join(mainRoot, "adapters"),
  path.join(mainRoot, "runtimes"),
  path.join(mainRoot, "connections"),
  mainCacheRoot,
  path.join(mainRoot, "protocols"),
  path.join(mainRoot, "security"),
  path.join(mainRoot, "transports"),
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
const agentDocsRoot = path.join(repoRoot, "docs", "architecture", "desktop-agent");
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
    if (isInside(filePath, mainProtocolRoot) && (
      isInsideOrSame(target, mainRuntimesRoot)
      || isInsideOrSame(target, mainApplicationRoot)
      || isInsideOrSame(target, path.join(mainRoot, "bootstrap"))
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; protocols may depend on transports/security, never concrete runtimes/application`);
    }
    if (isInside(filePath, mainSecurityRoot) && (
      isInsideOrSame(target, mainRuntimesRoot)
      || isInsideOrSame(target, mainProtocolRoot)
      || isInsideOrSame(target, mainApplicationRoot)
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; security is a provider-neutral infrastructure floor`);
    }
    if (isInside(filePath, mainTransportRoot) && (
      isInsideOrSame(target, mainRuntimesRoot)
      || isInsideOrSame(target, mainProtocolRoot)
      || isInsideOrSame(target, mainSecurityRoot)
      || isInsideOrSame(target, mainApplicationRoot)
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; transports are the infrastructure dependency floor`);
    }
    if (isInside(filePath, mainCacheRoot) && (
      isInsideOrSame(target, mainRuntimesRoot)
      || isInsideOrSame(target, mainProtocolRoot)
      || isInsideOrSame(target, mainApplicationRoot)
    )) {
      errors.push(`${relative(filePath)} imports ${relative(target)}; cache implementations stay provider-neutral and below application orchestration`);
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
  if (isInsideOrSame(filePath, rendererUiRoot) && filePath.endsWith(".tsx")) {
    if (/\bstyle=\{\{/.test(source)) {
      errors.push(`${relative(filePath)} contains a literal inline style object; static Agent presentation belongs in feature CSS`);
    }
    if (/\.style(?:\.|\[)/.test(stripComments(source))) {
      errors.push(`${relative(filePath)} mutates CSS through the DOM; static Agent presentation belongs in feature CSS`);
    }
    for (const match of source.matchAll(/\bstyle=\{([^}\n]+)\}/g)) {
      if (!/^agent[A-Z][A-Za-z0-9]*Geometry\(/.test(match[1].trim())) {
        errors.push(`${relative(filePath)} bypasses the typed Agent runtime-geometry bridge in a style prop`);
      }
    }
  }
}

const runtimeGeometryPath = path.join(rendererUiRoot, "agent-runtime-geometry.ts");
const runtimeGeometrySource = readFileSync(runtimeGeometryPath, "utf8");
if (!runtimeGeometrySource.includes("Record<`--agent-${string}`")) {
  errors.push(`${relative(runtimeGeometryPath)} must expose runtime measurements only through typed --agent-* custom properties`);
}
if (/[,{]\s*(?:position|visibility|transform|transformOrigin|height|width|maxHeight|padding|margin|color|background|borderRadius)\s*:/.test(runtimeGeometrySource)) {
  errors.push(`${relative(runtimeGeometryPath)} owns a static visual declaration; move it to Agent CSS`);
}

const agentStyleRoot = path.join(rendererUiRoot, "styles");
const agentStyleEntry = path.join(rendererUiRoot, "desktop-agent.css");
const styleEntrySource = readFileSync(agentStyleEntry, "utf8");
const styleEntryBody = styleEntrySource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/@import\s+[^;]+;/g, "")
  .trim();
if (!styleEntrySource.includes('@import "./styles/') || styleEntryBody !== "") {
  errors.push("src/features/desktop-agent/ui/desktop-agent.css must remain an import-only public style entry");
}
for (const entry of readdirSync(agentStyleRoot)) {
  if (!entry.endsWith(".css")) continue;
  const stylePath = path.join(agentStyleRoot, entry);
  const styleSource = readFileSync(stylePath, "utf8");
  if (entry === "responsive.css" && /desktop-agent-(?:virtual-row\[data-kind=["'](?:assistant|user|turn-summary)["']\]|message\.is-(?:assistant|user)|turn-summary)/.test(styleSource)) {
    errors.push(`${relative(stylePath)} overrides a conversation-role content rail; responsive rules may change width, not semantic alignment`);
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
    if (/features\/desktop-agent\/(?!index(?:\.|$)|lazy(?:\.|$)|visual-smoke(?:\.|$))/.test(specifier)) {
      errors.push(`${relative(filePath)} deep-imports ${specifier}; consume the feature public index`);
    }
  }
}

const registrySource = readFileSync(path.join(mainRuntimeRoot, "agent-runtime-registry.mjs"), "utf8");
if (/\b(?:opencode|codex|claude|cursor)\b/i.test(stripComments(registrySource))) {
  errors.push("electron/main/agent/runtime/agent-runtime-registry.mjs names a concrete provider");
}

const mainEntrySource = readFileSync(path.join(repoRoot, "electron", "main.mjs"), "utf8");
const ephemeralCacheSource = readFileSync(
  path.join(mainCacheRoot, "ephemeral-agent-session-cache.mjs"),
  "utf8",
);
if (!mainEntrySource.includes("createEphemeralAgentSessionCache") || mainEntrySource.includes("createAgentPersistence")) {
  errors.push("electron/main.mjs must compose the process-local Agent session cache directly");
}
if (/\b(?:writeFile|appendFile|createWriteStream|rename)\b/.test(stripComments(ephemeralCacheSource))) {
  errors.push("ephemeral-agent-session-cache.mjs must never write Chat session or transcript data");
}
if (!ephemeralCacheSource.includes("durable: false") || !ephemeralCacheSource.includes("desktop-agent-sessions.json")) {
  errors.push("ephemeral-agent-session-cache.mjs must declare non-durability and delete the legacy Chat journal");
}

const architectureReadmeSource = readFileSync(path.join(agentDocsRoot, "README.md"), "utf8");
const nativeHarnessAdrSource = readFileSync(
  path.join(agentDocsRoot, "ADR-006-native-harness-adapters-and-acp.md"),
  "utf8",
);
const architectureMapStart = "<!-- agent-runtime-map:start -->";
const architectureMapEnd = "<!-- agent-runtime-map:end -->";
const readmeArchitectureMap = extractMarkedDocumentBlock(
  architectureReadmeSource,
  architectureMapStart,
  architectureMapEnd,
  "docs/architecture/desktop-agent/README.md",
);
const adrArchitectureMap = extractMarkedDocumentBlock(
  nativeHarnessAdrSource,
  architectureMapStart,
  architectureMapEnd,
  "docs/architecture/desktop-agent/ADR-006-native-harness-adapters-and-acp.md",
);
if (readmeArchitectureMap && adrArchitectureMap && readmeArchitectureMap !== adrArchitectureMap) {
  errors.push("Desktop Agent README and ADR-006 must contain the same canonical runtime architecture map");
}
for (const requiredText of [
  "One PuppyOne Chat UI / product control plane",
  "codex app-server (JSONL-RPC over stdio)",
  "official Claude Agent SDK + user's Claude Code executable",
  "Agent Client Protocol (JSON-RPC 2.0 over stdio)",
  "PuppyOne-bundled and pinned OpenCode kernel",
  "discovery and diagnostics only",
]) {
  if (!readmeArchitectureMap?.includes(requiredText)) {
    errors.push(`canonical Desktop Agent architecture map is missing: ${requiredText}`);
  }
}

for (const retiredDocument of [
  "ADR-001-opencode-sidecar.md",
  "ADR-003-opencode-only-chat-harness.md",
]) {
  const retiredSource = readFileSync(path.join(agentDocsRoot, retiredDocument), "utf8");
  if (!/Status: retired and superseded by/.test(retiredSource)) {
    errors.push(`${retiredDocument} must remain an explicit retired-decision tombstone`);
  }
  if (/^## Decision$/m.test(retiredSource) || retiredSource.split("\n").length > 80) {
    errors.push(`${retiredDocument} contains active or expanded legacy instructions; keep history in Git`);
  }
}

const adoptionSpikeSource = readFileSync(path.join(agentDocsRoot, "opencode-adoption-spike.md"), "utf8");
if (!adoptionSpikeSource.includes("Status: archived research evidence; not an implementation specification.")) {
  errors.push("opencode-adoption-spike.md must remain explicitly archived and non-normative");
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

function extractMarkedDocumentBlock(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    errors.push(`${label} is missing the canonical Agent architecture map markers`);
    return "";
  }
  if (source.indexOf(startMarker, start + startMarker.length) >= 0 || source.indexOf(endMarker, end + endMarker.length) >= 0) {
    errors.push(`${label} must contain exactly one canonical Agent architecture map`);
    return "";
  }
  return source.slice(start + startMarker.length, end).trim();
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

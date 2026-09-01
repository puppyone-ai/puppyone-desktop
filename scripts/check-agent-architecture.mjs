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
const mainPersistenceRoot = path.join(mainRoot, "persistence");
const mainInfrastructureRoot = path.join(mainRoot, "infrastructure");
const mainConcreteRoots = [
  path.join(mainRoot, "adapters"),
  path.join(mainRoot, "runtimes"),
  path.join(mainRoot, "connections"),
  mainCacheRoot,
  path.join(mainRoot, "protocols"),
  path.join(mainRoot, "security"),
  path.join(mainRoot, "transports"),
  path.join(mainRoot, "bootstrap"),
  mainPersistenceRoot,
  mainInfrastructureRoot,
];
const rendererRoot = path.join(repoRoot, "src", "features", "desktop-agent");
const rendererDomainRoot = path.join(rendererRoot, "domain");
const rendererApplicationRoot = path.join(rendererRoot, "application");
const rendererInfrastructureRoot = path.join(rendererRoot, "infrastructure");
const rendererUiRoot = path.join(rendererRoot, "ui");
const rendererComposerRoot = path.join(rendererUiRoot, "composer");
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
const nativeReferenceTransportPattern = /\b(?:data-url|local-snapshot|snapshotUrl|resource_link|localImage|embeddedContext)\b/;
const errors = [];

const composerRootSource = readFileSync(path.join(rendererUiRoot, "AgentComposer.tsx"), "utf8");
for (const leaf of ["AgentAttachmentButton.tsx", "AgentCommandSuggestions.tsx", "AgentDraftReferenceList.tsx"]) {
  const leafPath = path.join(rendererComposerRoot, leaf);
  if (!existsSync(leafPath)) {
    errors.push(`${relative(leafPath)} is required; keep Composer acquisition, suggestions and draft references in private leaves`);
    continue;
  }
  const leafSource = readFileSync(leafPath, "utf8");
  if (/AgentSessionController|infrastructure\/|puppyoneDesktop/.test(stripComments(leafSource))) {
    errors.push(`${relative(leafPath)} owns business/infrastructure state; Composer leaves must consume domain props and callbacks only`);
  }
}
if (composerRootSource.split("\n").length >= 190 || /\buseState\b|function ReferenceChip/.test(stripComments(composerRootSource))) {
  errors.push("src/features/desktop-agent/ui/AgentComposer.tsx must remain a controlled composition root; move local leaves under ui/composer/");
}

for (const legacyPath of legacyPresentationPaths) {
  if (existsSync(legacyPath)) errors.push(`${relative(legacyPath)} is a legacy presentation location; use ui/`);
}
const retiredProviderPicker = path.join(rendererUiRoot, "AgentProviderPicker.tsx");
if (existsSync(retiredProviderPicker)) {
  errors.push(`${relative(retiredProviderPicker)} is retired; Agent selection must use AgentRuntimePicker`);
}
const retiredActivityDispatcher = path.join(rendererUiRoot, "AgentActivityItem.tsx");
if (existsSync(retiredActivityDispatcher)) {
  errors.push(`${relative(retiredActivityDispatcher)} is retired; semantic parts must dispatch through AgentPartRendererRegistry`);
}

const semanticRendererRegistry = path.join(rendererUiRoot, "AgentPartRendererRegistry.tsx");
const semanticPartRenderer = path.join(rendererUiRoot, "AgentPartRenderer.tsx");
if (!existsSync(semanticRendererRegistry)) {
  errors.push(`${relative(semanticRendererRegistry)} is required; semantic Renderer extension must use one typed registry`);
} else {
  const registrySource = readFileSync(semanticRendererRegistry, "utf8");
  for (const requiredText of ["AgentPartKind", "AgentPartByKind", "registerAgentPartRenderer", "resolveAgentPartRenderer"]) {
    if (!registrySource.includes(requiredText)) errors.push(`${relative(semanticRendererRegistry)} is missing ${requiredText}`);
  }
}
if (existsSync(semanticPartRenderer)) {
  const rendererSource = stripComments(readFileSync(semanticPartRenderer, "utf8"));
  if (providerNamePattern.test(rendererSource)) {
    errors.push(`${relative(semanticPartRenderer)} dispatches by Provider; render only canonical semantic part kinds`);
  }
}

const turnLifecyclePolicy = path.join(rendererDomainRoot, "agent-turn-lifecycle.ts");
if (!existsSync(turnLifecyclePolicy)) {
  errors.push(`${relative(turnLifecyclePolicy)} is required; terminal reconciliation needs one domain authority`);
} else {
  const lifecycleSource = readFileSync(turnLifecyclePolicy, "utf8");
  for (const requiredText of ["LIVE_AGENT_ACTIVITY_STATUSES", "agentTurnTerminalState", "reconcileTerminalAgentTurn"]) {
    if (!lifecycleSource.includes(requiredText)) errors.push(`${relative(turnLifecyclePolicy)} is missing ${requiredText}`);
  }
}
for (const projectionPath of [
  path.join(rendererDomainRoot, "agent-projection.ts"),
  path.join(rendererDomainRoot, "agent-typed-part-projection.ts"),
]) {
  const projectionSource = readFileSync(projectionPath, "utf8");
  if (/function\s+(?:activityTerminalStatus|isLiveActivityStatus|isTerminalTurnEvent)\b|const\s+LIVE_ACTIVITY_STATUSES\b/.test(projectionSource)) {
    errors.push(`${relative(projectionPath)} duplicates terminal lifecycle policy; use agent-turn-lifecycle.ts`);
  }
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
  if (nativeReferenceTransportPattern.test(stripComments(source))) {
    errors.push(`${relative(filePath)} knows a native reference transport; Renderer must consume semantic admission capabilities only`);
  }
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

const sharedAgentTypesSource = readFileSync(path.join(sharedContractRoot, "types.ts"), "utf8");
if (/\bAgentReferenceTransport\b|"(?:data-url|local-snapshot|resource)"/.test(stripComments(sharedAgentTypesSource))) {
  errors.push("shared/agent-contract/types.ts exposes a native reference transport; wire mappings belong inside runtime adapters");
}
for (const requiredText of ["schemaVersion: 1", "attachments: Record<AgentAttachmentKind", "maxBytesPerReference"]) {
  if (!sharedAgentTypesSource.includes(requiredText)) {
    errors.push(`semantic Agent reference capability contract is missing: ${requiredText}`);
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
const themeStylePath = path.join(agentStyleRoot, "theme.css");
const foundationStylePath = path.join(agentStyleRoot, "foundation.css");
const transcriptStylePath = path.join(agentStyleRoot, "transcript.css");
const composerStylePath = path.join(agentStyleRoot, "composer.css");
const themeStyleSource = readFileSync(themeStylePath, "utf8");
const foundationStyleSource = readFileSync(foundationStylePath, "utf8");
const transcriptStyleSource = readFileSync(transcriptStylePath, "utf8");
const composerStyleSource = readFileSync(composerStylePath, "utf8");
const themeImportIndex = styleEntrySource.indexOf('@import "./styles/theme.css"');
const foundationImportIndex = styleEntrySource.indexOf('@import "./styles/foundation.css"');
if (themeImportIndex < 0 || foundationImportIndex < 0 || themeImportIndex > foundationImportIndex) {
  errors.push("Agent theme.css must be the first feature style contract, before structural foundation.css");
}
for (const token of [
  "--agent-prompt-surface: var(--po-active)",
  "--agent-reference-surface:",
  "--agent-reference-error-surface:",
]) {
  if (!themeStyleSource.includes(token)) {
    errors.push(`${relative(themeStylePath)} is missing semantic role ${token}`);
  }
}
for (const token of [
  "--agent-prompt-surface:",
  "--agent-reference-surface:",
  "--agent-reference-error-surface:",
]) {
  if (foundationStyleSource.includes(token)) {
    errors.push(`${relative(foundationStylePath)} declares ${token}; visual roles belong to theme.css`);
  }
}
if (themeStyleSource.includes("--agent-connection-surface") || foundationStyleSource.includes("--agent-connection-surface")) {
  errors.push("Connection recovery is transient inline state and must not own a card-surface token");
}
if (!composerStyleSource.includes("background: var(--agent-prompt-surface)")
  || !transcriptStyleSource.includes("background: var(--agent-prompt-surface)")) {
  errors.push("Composer and transcript user prompts must consume one --agent-prompt-surface role");
}
const retiredPromptSurfacePattern = /--agent-(?:composer|user-message)-surface\b/;
const xpAgentStyleSource = readFileSync(
  path.join(repoRoot, "src", "styles", "interfaces", "windows-xp", "features", "agent.css"),
  "utf8",
);
for (const [label, source] of [
  ["Agent feature styles", [...readdirSync(agentStyleRoot)]
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => readFileSync(path.join(agentStyleRoot, entry), "utf8"))
    .join("\n")],
  ["Windows XP Agent adapter", xpAgentStyleSource],
]) {
  if (retiredPromptSurfacePattern.test(source)) {
    errors.push(`${label} restores retired component-specific prompt surface tokens`);
  }
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
const runtimeManifestSource = readFileSync(path.join(mainRuntimeRoot, "agent-runtime-manifest.mjs"), "utf8");
for (const requiredText of [
  "defineAgentRuntimeManifest",
  "runtimeDescriptorFromManifest",
  "generic-acp requires protocol.kind acp",
  "compatibility-bridge requires reviewed-bridge trust",
  "user-defined integration requires user-defined trust",
]) {
  if (!runtimeManifestSource.includes(requiredText)) {
    errors.push(`Agent runtime manifest contract is missing: ${requiredText}`);
  }
}
if (!registrySource.includes("candidate.manifest") || !registrySource.includes("runtimeDescriptorFromManifest")) {
  errors.push("Agent runtime registry must derive public descriptors from the versioned manifest source of truth");
}

const mainEntrySource = readFileSync(path.join(repoRoot, "electron", "main.mjs"), "utf8");
const ephemeralCacheSource = readFileSync(
  path.join(mainCacheRoot, "ephemeral-agent-session-cache.mjs"),
  "utf8",
);
const conversationCatalogSource = readFileSync(
  path.join(mainPersistenceRoot, "agent-conversation-catalog.mjs"),
  "utf8",
);
const sessionRepositorySource = readFileSync(
  path.join(mainPersistenceRoot, "agent-session-repository.mjs"),
  "utf8",
);
const processSupervisorSource = readFileSync(
  path.join(mainApplicationRoot, "processes", "agent-process-supervisor.mjs"),
  "utf8",
);
if (
  !mainEntrySource.includes("createEphemeralAgentSessionCache")
  || !mainEntrySource.includes("createAgentConversationCatalog")
  || !mainEntrySource.includes("createAgentSessionRepository")
  || mainEntrySource.includes("createAgentPersistence")
) {
  errors.push("electron/main.mjs must compose the ephemeral replay cache and metadata-only Conversation Catalog through one repository");
}
if (/\b(?:writeFile|appendFile|createWriteStream|rename)\b/.test(stripComments(ephemeralCacheSource))) {
  errors.push("ephemeral-agent-session-cache.mjs must never write Chat session or transcript data");
}
if (!ephemeralCacheSource.includes("durable: false") || !ephemeralCacheSource.includes("desktop-agent-sessions.json")) {
  errors.push("ephemeral-agent-session-cache.mjs must declare non-durability and delete the legacy Chat journal");
}
if (!conversationCatalogSource.includes("metadata-only index") || !conversationCatalogSource.includes("promises.rename")) {
  errors.push("agent-conversation-catalog.mjs must remain an atomic metadata-only native-session index");
}
if (/\b(?:events|prompt|transcript|messages|toolPayload)\s*:/.test(stripComments(conversationCatalogSource))) {
  errors.push("agent-conversation-catalog.mjs must not serialize transcript, prompt, message, event, or tool payload fields");
}
if (!sessionRepositorySource.includes("event cache wins") || !sessionRepositorySource.includes("conversationCatalog.findLatest")) {
  errors.push("agent-session-repository.mjs must join live replay state with the durable native-session pointer catalog");
}
if (!mainEntrySource.includes("createAgentProcessSupervisor") || !processSupervisorSource.includes("maxConcurrentStarts")) {
  errors.push("native Agent process starts must be bounded by the shared process supervisor");
}

const routingPreferencesSource = readFileSync(
  path.join(repoRoot, "src", "features", "app-shell", "agentRoutingPreferences.ts"),
  "utf8",
);
const runtimePickerSource = readFileSync(path.join(rendererUiRoot, "AgentRuntimePicker.tsx"), "utf8");
const backendRoutingSource = readFileSync(path.join(rendererDomainRoot, "agent-backend-routing.ts"), "utf8");
if (!routingPreferencesSource.includes("routes: Record<string, AgentRoutePreference>") || !routingPreferencesSource.includes("legacyModelId")) {
  errors.push("Agent routing preferences must be versioned, runtime-scoped, and migrate the legacy global model");
}
if (!runtimePickerSource.includes("AgentRuntimePicker") || !runtimePickerSource.includes("agent.runtime.")) {
  errors.push("the Chat header must expose an Agent runtime picker, not a provider picker");
}
if (/filter\([^\n]*bundled/.test(stripComments(backendRoutingSource))) {
  errors.push("the runtime catalog must not hide the bundled PuppyOne Agent");
}

const genericAcpSource = readFileSync(path.join(mainProtocolRoot, "acp", "acp-runtime-adapter.mjs"), "utf8");
const cursorAcpSource = readFileSync(path.join(mainRuntimesRoot, "cursor", "cursor-acp-adapter.mjs"), "utf8");
const cursorDiscoverySource = readFileSync(path.join(mainRuntimesRoot, "cursor", "cursor-discovery.mjs"), "utf8");
const runtimeResolutionSource = readFileSync(
  path.join(mainApplicationRoot, "runtime-resolution", "runtime-resolution-coordinator.mjs"),
  "utf8",
);
for (const lifecycleFile of ["agent-service.mjs", "native-conversation-indexer.mjs"]) {
  const lifecycleSource = readFileSync(path.join(mainApplicationRoot, lifecycleFile), "utf8");
  if (/runtimeRegistry\.discover\s*\(/.test(stripComments(lifecycleSource))) {
    errors.push(`${lifecycleFile} bypasses RuntimeResolutionCoordinator with direct Registry discovery`);
  }
}
if (!runtimeResolutionSource.includes("resolveForOperation") || !runtimeResolutionSource.includes("runtimeRegistry.discover")) {
  errors.push("RuntimeResolutionCoordinator must remain the single application authority over Registry discovery");
}
if (/cursor\/|managedOpenCodeAcpConfig|OPENCODE_/.test(stripComments(genericAcpSource))) {
  errors.push("the shared ACP adapter must remain free of Cursor and OpenCode policy");
}
if (!cursorAcpSource.includes('questionMethods: ["cursor/ask_question"]') || !cursorDiscoverySource.includes('compatibility: "acp-v1"')) {
  errors.push("Cursor must use the generic ACP core with isolated Cursor extensions");
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

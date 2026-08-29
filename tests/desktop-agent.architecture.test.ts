import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Agent architecture boundaries", () => {
  it("keeps RightAgentPanel as composition and the controller framework independent", () => {
    const panel = source("src/features/desktop-agent/ui/RightAgentPanel.tsx");
    const tabPanel = source("src/features/desktop-agent/ui/AgentChatTabPanel.tsx");
    const layout = source("src/features/desktop-agent/ui/AgentPanelLayout.tsx");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const preparer = source("src/features/desktop-agent/application/AgentSessionPreparer.ts");
    expect(panel.split("\n").length).toBeLessThan(230);
    expect(panel).not.toMatch(/useState|bufferedEvents|replayInFlight|applyAgentEvent/);
    expect(panel).toContain("<AgentSessionTabs");
    expect(panel).toContain("<AgentChatTabPanel");
    expect(tabPanel).toContain("<AgentPanelLayout");
    expect(layout).toContain('className="desktop-agent-boundary"');
    expect(layout).toContain('className="desktop-agent-panel"');
    expect(layout).toContain('className="desktop-agent-conversation-region"');
    expect(layout).toContain('className="desktop-agent-dock-region"');
    expect(controller).not.toMatch(/from ["']react["']|JSX\.|<section/);
    expect(controller).toContain("agentControllerTransitions");
    expect(controller).toContain("prepareSession()");
    expect(controller).toContain("new AgentSessionPreparer");
    expect(controller).toContain("this.sessionPreparer.prepare()");
    expect(preparer).toContain("preparationPromise");
    expect(preparer).toContain("closeStale");
    expect(source("src/features/desktop-agent/ui/useAgentSessionPreparation.ts")).toContain("controller.prepareSession()");
  });

  it("enforces virtual, responsive, safe presentation contracts", () => {
    const timeline = source("src/features/desktop-agent/ui/AgentTranscript.tsx");
    const markdown = source("src/features/desktop-agent/ui/SafeMarkdown.tsx");
    const composer = source("src/features/desktop-agent/ui/AgentComposer.tsx");
    const picker = source("src/features/desktop-agent/ui/AgentPickerPopover.tsx");
    const runtimeGeometry = source("src/features/desktop-agent/ui/agent-runtime-geometry.ts");
    const cssEntry = source("src/features/desktop-agent/ui/desktop-agent.css");
    const foundation = source("src/features/desktop-agent/ui/styles/foundation.css");
    const pickers = source("src/features/desktop-agent/ui/styles/pickers.css");
    const css = agentStyles();
    const globalLayout = source("src/styles/layout.css");
    expect(timeline).toContain("MAX_MOUNTED_ROWS = 120");
    expect(markdown).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toContain('["https:", "http:", "mailto:"]');
    expect(cssEntry).toContain('@import "./styles/foundation.css"');
    expect(cssEntry).toContain('@import "./styles/pickers.css"');
    expect(cssEntry.split("\n").length).toBeLessThan(30);
    expect(foundation).toMatch(/\.desktop-agent-boundary\s*\{[^}]*container:\s*desktop-agent \/ inline-size/s);
    expect(foundation).not.toMatch(/\.desktop-agent-panel\s*\{[^}]*container:/s);
    expect(foundation).toMatch(/\.desktop-agent-panel\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/s);
    expect(foundation).toContain("--agent-radius-composer: var(--desktop-sidebar-row-radius, 6px)");
    expect(foundation).toContain("--agent-inline-inset: var(--desktop-sidebar-row-left-gap, 12px)");
    expect(pickers).toMatch(
      /\.desktop-agent-picker\.is-header \.desktop-agent-picker-trigger\s*\{[^}]*color:\s*var\(--desktop-titlebar-text-muted, var\(--po-text-muted\)\);[^}]*font-size:\s*var\(--po-font-size-chrome, 13px\);[^}]*font-weight:\s*var\(--po-font-weight-chrome, 500\);[^}]*line-height:\s*18px;/s,
    );
    expect(css).not.toContain("max-width: 759px");
    expect(css).toContain("max-width: 559px");
    expect(css).toContain("max-width: 419px");
    expect(css).toContain("prefers-reduced-motion");
    expect(globalLayout).not.toContain(".desktop-agent-");
    expect(composer).not.toContain("useLayoutEffect");
    expect(composer).not.toMatch(/\.style(?:\.|\[)/);
    expect(composer).not.toContain("ResizeObserver");
    expect(composer).toContain("rows={1}");
    expect(css).toMatch(/\.desktop-agent-composer textarea\s*\{[^}]*field-sizing:\s*content[^}]*overflow-y:\s*auto/s);
    expect(composer).not.toContain("<select");
    expect(picker).toContain("DesktopOverlayLayer");
    expect(picker).toContain("useAnchoredOverlayPosition");
    expect(timeline).not.toContain("style={{");
    expect(picker).not.toContain("style={{");
    expect(runtimeGeometry).toContain("Record<`--agent-${string}`");
    expect(runtimeGeometry).not.toMatch(/[,{]\s*(?:position|visibility|transform|transformOrigin|height|width|maxHeight|padding|margin|color|background|borderRadius)\s*:/);
  });

  it("keeps product-critical Agent performance scenarios in the benchmark suite", () => {
    const benchmark = source("benchmarks/performance/agent-chat.bench.ts");
    const app = source("src/App.tsx");
    expect(benchmark).toContain("128 KiB of safe Markdown");
    expect(benchmark).toContain("64 KiB command output and 240-line diff");
    expect(benchmark).toContain("500-model searchable picker");
    expect(benchmark).toContain("2,000-row transcript with bounded DOM");
    expect(app).toContain('import { isDesktopAgentChatEnabled, loadRightAgentPanel } from "./features/desktop-agent/lazy"');
    expect(app).toContain("lazy(loadRightAgentPanel)");
    expect(source("src/features/desktop-agent/lazy.ts")).toContain('import("./ui/RightAgentPanel")');
    expect(app).not.toContain('RightAgentPanel } from "./features/desktop-agent"');
  });

  it("keeps application behind an explicit client port and Electron access in the composition adapter", () => {
    const port = source("src/features/desktop-agent/application/AgentClientPort.ts");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const adapter = source("src/features/desktop-agent/infrastructure/electron/electronAgentClient.ts");
    expect(port).toContain("export interface AgentClientPort");
    expect(controller).not.toMatch(/window\.|puppyoneDesktop|infrastructure\//);
    expect(adapter).toContain("window.puppyoneDesktop");
  });

  it("persists routing and native-session metadata, never PuppyOne Chat History", () => {
    const main = source("electron/main.mjs");
    const sessionCache = source("electron/main/agent/cache/ephemeral-agent-session-cache.mjs");
    const conversationCatalog = source("electron/main/agent/persistence/agent-conversation-catalog.mjs");
    const inventory = source("electron/main/agent/connections/local-agent-inventory.mjs");
    const preferences = source("src/features/app-shell/preferences.ts");
    const header = source("src/features/desktop-agent/ui/AgentSurfaceHeader.tsx");
    const controllerState = source("src/features/desktop-agent/application/agent-controller-state.ts");
    expect(main).toContain("createEphemeralAgentSessionCache");
    expect(main).toContain("createAgentConversationCatalog");
    expect(main).toContain("createAgentSessionRepository");
    expect(sessionCache).toContain("PuppyOne does not own Chat History");
    expect(sessionCache).not.toMatch(/promises\.writeFile|desktop-agent-sessions\.json.*write/);
    expect(conversationCatalog).toContain("metadata-only index");
    expect(conversationCatalog).not.toContain("events:");
    expect(conversationCatalog).toContain("return compact({");
    expect(conversationCatalog).toContain("providerSessionId,");
    expect(main).toContain("agent-runtime-inventory.json");
    expect(inventory).toContain("PERSISTED_CACHE_TTL_MS");
    expect(preferences).toContain("AGENT_ROUTING_PREFERENCES_STORAGE_KEY");
    expect(header).not.toMatch(/Session history|Recent chats|Archive chat|Delete local chat|Fork chat/);
    expect(controllerState).not.toContain("history:");
    expect(controllerState).toContain('AgentSubmissionStage = "preparing-session" | "starting-turn" | null');
  });

  it("keeps native transport internals and rendered architecture diagrams out of Renderer/docs", () => {
    const preload = source("electron/preload.cjs");
    const renderer = [
      source("src/features/desktop-agent/ui/RightAgentPanel.tsx"),
      source("src/features/desktop-agent/application/AgentSessionController.ts"),
      source("src/features/desktop-agent/agentTypes.ts"),
    ].join("\n");
    const docs = source("docs/architecture/desktop-agent/README.md");
    expect(preload).not.toMatch(/spawnAgent|agentStdin|OpenCodeHttpClient|OPENCODE_SERVER_PASSWORD/);
    expect(renderer).not.toMatch(/OpenCodeHttpClient|OPENCODE_SERVER_PASSWORD|\/global\/event/);
    expect(docs).not.toContain("```mermaid");
    expect(docs).toContain("no   Chat transcript");
    expect(docs).toContain("codex app-server -> Codex harness");
    expect(docs).toContain("ACP -> user's OpenCode harness");
  });

  it("keeps Core backend-neutral and concrete backends in the single production composition root", () => {
    const registry = source("electron/main/agent/runtime/agent-runtime-registry.mjs");
    const bootstrap = source("electron/main/agent/bootstrap/create-agent-runtime-host.mjs");
    const contract = source("shared/agent-contract/schema.mjs");
    expect(registry).not.toMatch(/opencode|codex|claude|cursor/i);
    expect(bootstrap).toContain("createPuppyOneAgentRuntimeDefinition");
    expect(bootstrap).toContain("createCodexRuntimeDefinition");
    expect(bootstrap).toContain("createClaudeRuntimeDefinition");
    expect(bootstrap).toContain("createOpenCodeNativeRuntimeDefinition");
    expect(bootstrap).toContain("createCursorRuntimeDefinition");
    expect(bootstrap).toContain('DEFAULT_AGENT_RUNTIME_ID = "puppyone-agent"');
    expect(contract).toContain("parseAgentIpcRequest");
    expect(contract).toContain("assertAgentIpcResponse");
  });

  it("keeps ACP generic, Cursor extensions isolated and native starts supervised", () => {
    const acpCore = source("electron/main/agent/protocols/acp/acp-runtime-adapter.mjs");
    const cursor = source("electron/main/agent/runtimes/cursor/cursor-acp-adapter.mjs");
    const cursorDiscovery = source("electron/main/agent/runtimes/cursor/cursor-discovery.mjs");
    const claude = source("electron/main/agent/runtimes/claude/claude-identity.mjs");
    const main = source("electron/main.mjs");
    expect(acpCore).not.toMatch(/cursor\/|managedOpenCodeAcpConfig|OPENCODE_/);
    expect(cursor).toContain('authenticationMethodId: "cursor_login"');
    expect(cursor).toContain('questionMethods: ["cursor/ask_question"]');
    expect(cursorDiscovery).toContain('compatibility: "acp-v1"');
    expect(cursorDiscovery).toContain('status: "ready"');
    expect(claude).toContain('displayName: "Claude Agent"');
    expect(main).toContain("createAgentProcessSupervisor");
    expect(main).toContain("agentProcessSupervisor");
  });

  it("keeps ACP lifecycle generic and OpenCode policy/runtime selection explicit", () => {
    const adapter = source("electron/main/agent/runtimes/opencode-protocol/opencode-acp-adapter.mjs");
    const acpCore = source("electron/main/agent/protocols/acp/acp-runtime-adapter.mjs");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const panel = source("src/features/desktop-agent/ui/AgentChatTabPanel.tsx");
    expect(adapter).toContain("extends AcpRuntimeAdapter");
    expect(adapter).toContain("managedOpenCodeAcpConfig");
    expect(acpCore).toContain("client.newSession");
    expect(acpCore).toContain("resolveAcpModels");
    expect(acpCore).toContain("publicProviders");
    expect(acpCore).toContain("PuppyOne deliberately does not");
    expect(controller).toContain("selectedProviderId");
    expect(panel.indexOf("agentRuntimes=")).toBeLessThan(panel.indexOf("models="));
    expect(panel).toContain("agentSelector={<AgentRuntimePicker");
    expect(source("src/features/desktop-agent/ui/AgentComposer.tsx")).not.toContain("AgentRuntimePicker");
  });

  it("keeps local executable inventory main-owned, lazy and separate from OpenCode provider authority", () => {
    const inventory = source("electron/main/agent/connections/local-agent-inventory.mjs");
    const candidates = source("electron/main/agent/connections/probes/executable-candidates.mjs");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const runtimePicker = source("src/features/desktop-agent/ui/AgentRuntimePicker.tsx");
    const backendRouting = source("src/features/desktop-agent/domain/agent-backend-routing.ts");
    const registry = source("electron/main/agent/connections/tools/local-agent-tool-registry.mjs");
    expect(inventory).not.toMatch(/from ["']react|OpenCode|providerCatalog/);
    expect(candidates).not.toMatch(/-ilc|login shell|exec\(/i);
    expect(controller.indexOf("discoverLocalConnections")).toBeGreaterThan(controller.indexOf("initialize(refresh"));
    expect(runtimePicker).not.toMatch(/Local tools|AgentLocalConnection|connection\.id/);
    expect(runtimePicker).not.toMatch(/Coding Agents|Detected|Refresh/);
    expect(runtimePicker).toContain("A non-ready runtime remains inspectable");
    expect(backendRouting).not.toMatch(/puppyone-agent|codex|claude|cursor|opencode/i);
    expect(registry).toContain("validateDescriptor");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function agentStyles() {
  return ["foundation", "transcript", "activities", "blocking", "composer", "pickers", "responsive"]
    .map((name) => source(`src/features/desktop-agent/ui/styles/${name}.css`))
    .join("\n");
}

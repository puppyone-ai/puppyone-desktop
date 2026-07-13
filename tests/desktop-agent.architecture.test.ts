import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Agent architecture boundaries", () => {
  it("keeps RightAgentPanel as composition and the controller framework independent", () => {
    const panel = source("src/features/desktop-agent/ui/RightAgentPanel.tsx");
    const layout = source("src/features/desktop-agent/ui/AgentPanelLayout.tsx");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const preparer = source("src/features/desktop-agent/application/AgentSessionPreparer.ts");
    expect(panel.split("\n").length).toBeLessThan(230);
    expect(panel).not.toMatch(/useState|bufferedEvents|replayInFlight|applyAgentEvent/);
    expect(panel).toContain("<AgentPanelLayout");
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

  it("persists only Agent selection and discovery metadata, never PuppyOne Chat History", () => {
    const main = source("electron/main.mjs");
    const sessionCache = source("electron/main/agent/cache/ephemeral-agent-session-cache.mjs");
    const inventory = source("electron/main/agent/connections/local-agent-inventory.mjs");
    const preferences = source("src/features/app-shell/preferences.ts");
    const header = source("src/features/desktop-agent/ui/AgentSurfaceHeader.tsx");
    const controllerState = source("src/features/desktop-agent/application/agent-controller-state.ts");
    expect(main).toContain("createEphemeralAgentSessionCache");
    expect(sessionCache).toContain("PuppyOne does not own Chat History");
    expect(sessionCache).not.toMatch(/promises\.writeFile|desktop-agent-sessions\.json.*write/);
    expect(main).toContain("agent-runtime-inventory.json");
    expect(inventory).toContain("PERSISTED_CACHE_TTL_MS");
    expect(preferences).toContain("AGENT_PREFERRED_RUNTIME_STORAGE_KEY");
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
    expect(docs).toContain("codex app-server (JSONL-RPC over stdio)");
    expect(docs).toContain("user's OpenCode executable, profile, auth and native session");
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

  it("keeps ACP model authority in the OpenCode adapter and explicit selection in application state", () => {
    const adapter = source("electron/main/agent/runtimes/opencode-protocol/opencode-acp-adapter.mjs");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const panel = source("src/features/desktop-agent/ui/RightAgentPanel.tsx");
    expect(adapter).toContain("client.newSession");
    expect(adapter).toContain("resolveAcpModels");
    expect(adapter).toContain("publicProviders");
    expect(adapter).toContain("PuppyOne deliberately does not");
    expect(controller).toContain("selectedProviderId");
    expect(panel.indexOf("agentProviders=")).toBeLessThan(panel.indexOf("models="));
    expect(panel).toContain("agentSelector={<AgentProviderPicker");
    expect(source("src/features/desktop-agent/ui/AgentComposer.tsx")).not.toContain("AgentProviderPicker");
  });

  it("keeps local executable inventory main-owned, lazy and separate from OpenCode provider authority", () => {
    const inventory = source("electron/main/agent/connections/local-agent-inventory.mjs");
    const candidates = source("electron/main/agent/connections/probes/executable-candidates.mjs");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const providerPicker = source("src/features/desktop-agent/ui/AgentProviderPicker.tsx");
    const backendRouting = source("src/features/desktop-agent/domain/agent-backend-routing.ts");
    const registry = source("electron/main/agent/connections/tools/local-agent-tool-registry.mjs");
    expect(inventory).not.toMatch(/from ["']react|OpenCode|providerCatalog/);
    expect(candidates).not.toMatch(/-ilc|login shell|exec\(/i);
    expect(controller.indexOf("discoverLocalConnections")).toBeGreaterThan(controller.indexOf("initialize(refresh"));
    expect(providerPicker).not.toMatch(/Local tools|AgentLocalConnection|connection\.id/);
    expect(providerPicker).not.toMatch(/Coding Agents|Detected|Refresh/);
    expect(providerPicker).toContain("Selection is a presentation concern");
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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Agent architecture boundaries", () => {
  it("keeps RightAgentPanel as composition and the controller framework independent", () => {
    const panel = source("src/features/desktop-agent/ui/RightAgentPanel.tsx");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    expect(panel.split("\n").length).toBeLessThan(230);
    expect(panel).not.toMatch(/useState|bufferedEvents|replayInFlight|applyAgentEvent/);
    expect(controller).not.toMatch(/from ["']react["']|JSX\.|<section/);
    expect(controller).toContain("agentControllerTransitions");
  });

  it("enforces virtual, responsive, safe presentation contracts", () => {
    const timeline = source("src/features/desktop-agent/ui/AgentTranscript.tsx");
    const markdown = source("src/features/desktop-agent/ui/SafeMarkdown.tsx");
    const composer = source("src/features/desktop-agent/ui/AgentComposer.tsx");
    const css = source("src/features/desktop-agent/ui/desktop-agent.css");
    const globalLayout = source("src/styles/layout.css");
    expect(timeline).toContain("MAX_MOUNTED_ROWS = 120");
    expect(markdown).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toContain('["https:", "http:", "mailto:"]');
    expect(css).toContain("container: desktop-agent / inline-size");
    expect(css).toContain("--agent-radius-composer: 22px");
    expect(css).toContain("max-width: 759px");
    expect(css).toContain("max-width: 559px");
    expect(css).toContain("max-width: 419px");
    expect(css).toContain("prefers-reduced-motion");
    expect(globalLayout).not.toContain(".desktop-agent-");
    expect(composer).toContain("useLayoutEffect");
    expect(composer).toContain("rows={1}");
    expect(composer).not.toContain("<select");
  });

  it("keeps sidecar transport and rendered architecture diagrams out of Renderer/docs", () => {
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
  });

  it("keeps Core provider-neutral and OpenCode as the only production harness", () => {
    const registry = source("electron/main/agent/runtime/agent-runtime-registry.mjs");
    const bootstrap = source("electron/main/agent/bootstrap/create-agent-runtime-host.mjs");
    const composer = source("src/features/desktop-agent/ui/AgentComposer.tsx");
    const providerPicker = source("src/features/desktop-agent/ui/AgentProviderPicker.tsx");
    const modelPicker = source("src/features/desktop-agent/ui/AgentModelPicker.tsx");
    const contract = source("shared/agent-contract/schema.mjs");
    expect(registry).not.toMatch(/opencode|codex|claude|cursor/i);
    expect(bootstrap).toContain("createOpenCodeRuntimeDefinition");
    expect(bootstrap).not.toContain("createCodexRuntimeDefinition");
    expect(composer).not.toMatch(/Agent runtime|onSelectRuntime|runtimes/);
    expect(providerPicker).toContain('ariaLabel="Agent provider"');
    expect(modelPicker).toContain('ariaLabel="Agent model"');
    expect(contract).toContain("parseAgentIpcRequest");
    expect(contract).toContain("assertAgentIpcResponse");
  });

  it("keeps connected-provider authority in the OpenCode adapter and explicit selection in application state", () => {
    const adapter = source("electron/main/agent/runtimes/opencode/opencode-sidecar-adapter.mjs");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const panel = source("src/features/desktop-agent/ui/RightAgentPanel.tsx");
    expect(adapter).toContain("client.providerCatalog");
    expect(adapter).not.toContain("client.providers(this.workspaceRoot)");
    expect(adapter).toContain("isAgentChatModel");
    expect(controller).toContain("selectedProviderId");
    expect(panel.indexOf("providers=")).toBeLessThan(panel.indexOf("models="));
  });

  it("keeps local executable inventory main-owned, lazy and separate from OpenCode provider authority", () => {
    const inventory = source("electron/main/agent/connections/local-agent-inventory.mjs");
    const candidates = source("electron/main/agent/connections/probes/executable-candidates.mjs");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    const picker = source("src/features/desktop-agent/ui/AgentProviderPicker.tsx");
    expect(inventory).not.toMatch(/from ["']react|OpenCode|providerCatalog/);
    expect(candidates).not.toMatch(/-ilc|login shell|exec\(/i);
    expect(controller.indexOf("discoverLocalConnections")).toBeGreaterThan(controller.indexOf("initialize(refresh"));
    expect(picker).toContain("Local tools on this Mac");
    expect(picker).toContain("Connected routes");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

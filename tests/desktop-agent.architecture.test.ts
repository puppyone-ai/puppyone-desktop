import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Desktop Agent architecture boundaries", () => {
  it("keeps RightAgentPanel as composition and the controller framework independent", () => {
    const panel = source("src/features/desktop-agent/RightAgentPanel.tsx");
    const controller = source("src/features/desktop-agent/application/AgentSessionController.ts");
    expect(panel.split("\n").length).toBeLessThan(230);
    expect(panel).not.toMatch(/useState|bufferedEvents|replayInFlight|applyAgentEvent/);
    expect(controller).not.toMatch(/from ["']react["']|JSX\.|<section/);
    expect(controller).toContain("agentControllerTransitions");
  });

  it("enforces virtual, responsive, safe presentation contracts", () => {
    const timeline = source("src/features/desktop-agent/AgentTranscript.tsx");
    const markdown = source("src/features/desktop-agent/components/SafeMarkdown.tsx");
    const css = source("src/features/desktop-agent/desktop-agent.css");
    expect(timeline).toContain("MAX_MOUNTED_ROWS = 120");
    expect(markdown).not.toContain("dangerouslySetInnerHTML");
    expect(markdown).toContain('["https:", "http:", "mailto:"]');
    expect(css).toContain("container: desktop-agent / inline-size");
    expect(css).toContain("max-width: 559px");
    expect(css).toContain("max-width: 419px");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("keeps sidecar transport and rendered architecture diagrams out of Renderer/docs", () => {
    const preload = source("electron/preload.cjs");
    const renderer = [
      source("src/features/desktop-agent/RightAgentPanel.tsx"),
      source("src/features/desktop-agent/application/AgentSessionController.ts"),
      source("src/features/desktop-agent/agentTypes.ts"),
    ].join("\n");
    const docs = source("docs/architecture/desktop-agent/README.md");
    expect(preload).not.toMatch(/spawnAgent|agentStdin|OpenCodeHttpClient|OPENCODE_SERVER_PASSWORD/);
    expect(renderer).not.toMatch(/OpenCodeHttpClient|OPENCODE_SERVER_PASSWORD|\/global\/event/);
    expect(docs).not.toContain("```mermaid");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

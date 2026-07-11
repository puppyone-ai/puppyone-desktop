/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AgentTranscript, agentTimelineLimits } from "../src/features/desktop-agent/AgentTranscript";
import { SafeMarkdown } from "../src/features/desktop-agent/components/SafeMarkdown";
import { createAgentProjection, type AgentPart } from "../src/features/desktop-agent/agentProjection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

describe("Desktop Agent virtual transcript", () => {
  it("keeps a 2,000-row fixture below the 120 mounted-row budget", () => {
    const projection = createAgentProjection();
    projection.parts = Array.from({ length: 2_000 }, (_, index): AgentPart => ({
      id: `assistant:${index}`,
      turnId: `turn:${Math.floor(index / 4)}`,
      itemId: `item:${index}`,
      kind: "assistant",
      text: `Row ${index}`,
      streaming: false,
      terminalState: null,
      sequence: index + 1,
    }));
    projection.rows = projection.parts.map((part) => ({
      id: `row:${part.id}`,
      partId: part.id,
      turnId: part.turnId,
      kind: part.kind,
      sequence: part.sequence,
      estimatedHeight: 72,
    }));
    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    expect(container.querySelectorAll(".desktop-agent-virtual-row").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".desktop-agent-virtual-row").length).toBeLessThanOrEqual(agentTimelineLimits.maxMountedRows);
    expect(container.querySelectorAll(".desktop-agent-virtual-row").length).toBeLessThanOrEqual(120);
  });

  it("renders Markdown without executing raw HTML or unsafe links", () => {
    const container = render(React.createElement(SafeMarkdown, { text: '# Result\n<script>window.pwned=1</script>\n[bad](javascript:alert(1))\n[good](https://example.com)' }));
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>window.pwned=1</script>");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("a")?.getAttribute("href")).toContain("https://example.com");
  });
});

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

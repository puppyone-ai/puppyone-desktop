/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AgentTranscript, agentTimelineLimits } from "../src/features/desktop-agent/ui/AgentTranscript";
import { SafeMarkdown, safeMarkdownLimits } from "../src/features/desktop-agent/ui/SafeMarkdown";
import { createAgentProjection, type AgentPart } from "../src/features/desktop-agent/agentProjection";
import { withTestLocalization } from "./testLocalization";

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

  it("progressively discloses long Markdown without mounting an unbounded initial document", () => {
    const text = "Paragraph\n\n".repeat(safeMarkdownLimits.maxInitialBlocks + 20);
    const container = render(React.createElement(SafeMarkdown, { text }));
    expect(container.querySelectorAll(".desktop-agent-markdown p").length)
      .toBeLessThanOrEqual(safeMarkdownLimits.maxInitialBlocks);
    const disclosure = container.querySelector<HTMLButtonElement>(".desktop-agent-markdown-disclosure");
    expect(disclosure?.textContent).toContain("Show full response");
    act(() => disclosure?.click());
    expect(container.querySelectorAll(".desktop-agent-markdown p").length).toBeGreaterThan(safeMarkdownLimits.maxInitialBlocks);
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
  });

  it("animates only newly committed parts and does not replay entrance motion after rerender", () => {
    const initial = projectionWithMessages(1);
    const container = render(React.createElement(AgentTranscript, { projection: initial, loading: false }));
    expect(container.querySelectorAll(".desktop-agent-virtual-row.is-new")).toHaveLength(0);

    const next = projectionWithMessages(2);
    act(() => root?.render(withTestLocalization(React.createElement(AgentTranscript, { projection: next, loading: false }))));
    expect(container.querySelectorAll(".desktop-agent-virtual-row.is-new")).toHaveLength(1);
    const animatedRow = container.querySelector(".desktop-agent-virtual-row.is-new");
    act(() => animatedRow?.dispatchEvent(new Event("animationend", { bubbles: true })));
    expect(container.querySelectorAll(".desktop-agent-virtual-row.is-new")).toHaveLength(0);

    act(() => root?.render(withTestLocalization(React.createElement(AgentTranscript, { projection: next, loading: false }))));
    expect(container.querySelectorAll(".desktop-agent-virtual-row.is-new")).toHaveLength(0);
    expect(container.querySelectorAll(".desktop-agent-virtual-row").item(1)).toBe(animatedRow);
  });
});

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(node)));
  return container;
}

function projectionWithMessages(count: number) {
  const projection = createAgentProjection();
  projection.parts = Array.from({ length: count }, (_, index): AgentPart => ({
    id: `assistant:${index}`,
    turnId: "turn:1",
    itemId: `item:${index}`,
    kind: "assistant",
    text: `Message ${index}`,
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
  projection.lastSequence = count;
  return projection;
}

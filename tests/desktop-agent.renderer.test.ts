/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentApprovalDock } from "../src/features/desktop-agent/AgentApprovalDock";
import { AgentTranscript } from "../src/features/desktop-agent/AgentTranscript";
import { createAgentProjection } from "../src/features/desktop-agent/agentProjection";
import type { AgentProviderReadiness } from "../src/features/desktop-agent/agentTypes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

describe("Desktop Agent renderer surfaces", () => {
  it("shows Jump to latest when the transcript is not pinned to the bottom", () => {
    const projection = createAgentProjection();
    projection.messages.push({
      id: "msg-1",
      role: "assistant",
      text: "hello".repeat(200),
      sequence: 1,
      turnId: "turn-1",
      itemId: "item-1",
      streaming: false,
      terminalState: null,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 800 });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get() { return (this as HTMLElement & { _scrollTop?: number })._scrollTop ?? 0; },
      set(value: number) { (this as HTMLElement & { _scrollTop?: number })._scrollTop = value; },
    });

    const container = render(React.createElement(AgentTranscript, { projection, loading: false }));
    const transcript = container.querySelector(".desktop-agent-transcript") as HTMLElement;
    act(() => {
      transcript.scrollTop = 0;
      transcript.dispatchEvent(new Event("scroll"));
    });
    expect(container.querySelector(".desktop-agent-jump-latest")?.textContent).toContain("Jump to latest");
  });

  it("disables approval actions while a decision is resolving", () => {
    const onResolve = vi.fn();
    const container = render(React.createElement(AgentApprovalDock, {
      approval: {
        requestId: "req-1",
        turnId: "turn-1",
        itemId: "item-1",
        kind: "command",
        title: "Run npm test",
        command: "npm test",
        cwd: "/workspace",
        commandActions: [],
        networkApprovalContext: null,
        grantRoot: null,
        policyChangeRequested: false,
        reason: null,
        availableDecisions: ["accept", "decline", "cancel"],
        sequence: 1,
      },
      queueLength: 1,
      resolving: true,
      onResolve,
    }));
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });

  it("renders material network and filesystem approval scope", () => {
    const container = render(React.createElement(AgentApprovalDock, {
      approval: {
        requestId: "req-network",
        turnId: "turn-1",
        itemId: "item-1",
        kind: "command",
        title: "Allow network access",
        command: null,
        cwd: "/workspace",
        commandActions: [],
        networkApprovalContext: { host: "registry.npmjs.org:443", protocol: "https" },
        grantRoot: "/workspace/generated",
        policyChangeRequested: true,
        reason: "Download a package",
        availableDecisions: ["accept", "decline", "cancel"],
        sequence: 1,
      },
      queueLength: 1,
      resolving: false,
      onResolve: vi.fn(),
    }));

    expect(container.textContent).toContain("https://registry.npmjs.org:443");
    expect(container.textContent).toContain("/workspace/generated");
    expect(container.textContent).toContain("reusable policy change");
  });

  it("renders unsupported-version readiness copy with detected and minimum versions", () => {
    const readiness: AgentProviderReadiness = {
      provider: "codex",
      status: "unsupported-version",
      version: "0.100.0",
      minimumVersion: "0.144.1",
      message: "Codex is too old.",
    };
    const container = render(React.createElement("div", {
      className: "desktop-agent-readiness",
      role: "status",
      children: [
        React.createElement("strong", { key: "h" }, "Codex update required"),
        React.createElement("p", { key: "p" },
          `Detected Codex ${readiness.version}; PuppyOne requires ${readiness.minimumVersion}. Update Codex via its install channel, then refresh.`,
        ),
      ],
    }));
    expect(container.textContent).toContain("0.100.0");
    expect(container.textContent).toContain("0.144.1");
    expect(container.textContent).toContain("Update Codex");
  });
});

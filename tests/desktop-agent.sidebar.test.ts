/**
 * @vitest-environment happy-dom
 */
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lifecycle = vi.hoisted(() => ({
  agentMounts: 0,
  agentUnmounts: 0,
  terminalMounts: 0,
  terminalUnmounts: 0,
  runningChange: null as null | ((running: boolean) => void),
}));

vi.mock("../src/features/desktop-agent/RightAgentPanel", () => ({
  RightAgentPanel: React.forwardRef(({ onRunningChange }: { onRunningChange?: (running: boolean) => void }, _ref) => {
    useEffect(() => {
      lifecycle.agentMounts += 1;
      lifecycle.runningChange = onRunningChange ?? null;
      return () => { lifecycle.agentUnmounts += 1; };
    }, [onRunningChange]);
    return React.createElement("div", { "data-testid": "agent" });
  }),
}));

vi.mock("../src/components/RightTerminalPanel", () => ({
  RightTerminalPanel: React.forwardRef(() => {
    useEffect(() => {
      lifecycle.terminalMounts += 1;
      return () => { lifecycle.terminalUnmounts += 1; };
    }, []);
    return React.createElement("div", { "data-testid": "terminal" });
  }),
}));

import { RightCompanionPanel } from "../src/features/desktop-agent/RightCompanionPanel";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  lifecycle.agentMounts = 0;
  lifecycle.agentUnmounts = 0;
  lifecycle.terminalMounts = 0;
  lifecycle.terminalUnmounts = 0;
  lifecycle.runningChange = null;
});

describe("Chat and Terminal companion switching", () => {
  it("keeps both React surfaces mounted while visibility changes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = {
      workspace: { id: "workspace", name: "Workspace", path: "/workspace" },
      active: true,
      terminalResetToken: 0,
      onSurfaceChange: vi.fn(),
    };
    act(() => root?.render(React.createElement(RightCompanionPanel, { ...props, surface: "chat" })));
    act(() => root?.render(React.createElement(RightCompanionPanel, { ...props, surface: "terminal" })));
    act(() => root?.render(React.createElement(RightCompanionPanel, { ...props, surface: "chat" })));

    expect(lifecycle.agentMounts).toBe(1);
    expect(lifecycle.terminalMounts).toBe(1);
    expect(lifecycle.agentUnmounts).toBe(0);
    expect(lifecycle.terminalUnmounts).toBe(0);
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
  });

  it("shows a Chat activity indicator while a turn runs under Terminal", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const props = {
      workspace: { id: "workspace", name: "Workspace", path: "/workspace" },
      active: true,
      terminalResetToken: 0,
      onSurfaceChange: vi.fn(),
    };
    act(() => root?.render(React.createElement(RightCompanionPanel, { ...props, surface: "terminal" })));
    expect(container.querySelector(".desktop-companion-tab-activity")).toBeNull();
    act(() => lifecycle.runningChange?.(true));
    const indicator = container.querySelector(".desktop-companion-tab-activity");
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute("aria-label")).toBe("Codex turn running");
    const chatTab = container.querySelector('[role="tab"][aria-selected="false"]')
      ?? container.querySelectorAll('[role="tab"]')[0];
    expect(chatTab?.textContent).toContain("Chat");
  });
});

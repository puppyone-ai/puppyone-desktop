/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchSplit } from "@puppyone/shared-ui";
import type {
  DesktopTerminalGroup,
  DesktopTerminalLayoutLeaf,
} from "../src/features/desktop-terminal/model/terminalSessions";
import { TerminalGroupViewport } from "../src/features/desktop-terminal/layout/TerminalGroupViewport";
import { usePersistentTerminalSessionHosts } from "../src/features/desktop-terminal/layout/session-host/usePersistentTerminalSessionHosts";
import { TerminalSessionHost } from "../src/features/desktop-terminal/ui/TerminalSessionHost";
import type { TerminalRuntimeHandle } from "../src/features/desktop-terminal/runtime/terminalRuntime";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Terminal Group split layout", () => {
  it("reparents the same stable Session hosts when the tree moves", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const hostA = terminalHost("a");
    const hostB = terminalHost("b");
    const hosts = new Map([["a", hostA], ["b", hostB]]);
    const runtime = createRuntime();
    const runtimeRegistry = { get: () => runtime };
    const first = group(
      createWorkbenchSplit({
        id: "split-a-b",
        direction: "horizontal",
        ratio: 0.5,
        first: leaf("a"),
        second: leaf("b"),
      }),
      "a",
    );

    act(() => root?.render(withTestLocalization(
      <TerminalGroupViewport
        dropIntent={null}
        group={first}
        hosts={hosts}
        runtimeRegistry={runtimeRegistry}
        onResizeSplit={vi.fn()}
      />,
    )));

    expect(container.querySelector('[data-terminal-session-pane-id="a"]')?.contains(hostA))
      .toBe(true);
    expect(container.querySelector('[data-terminal-session-pane-id="b"]')?.contains(hostB))
      .toBe(true);

    const moved = group(
      createWorkbenchSplit({
        id: "split-a-b",
        direction: "vertical",
        ratio: 0.5,
        first: leaf("b"),
        second: leaf("a"),
      }),
      "b",
    );
    act(() => root?.render(withTestLocalization(
      <TerminalGroupViewport
        dropIntent={null}
        group={moved}
        hosts={hosts}
        runtimeRegistry={runtimeRegistry}
        onResizeSplit={vi.fn()}
      />,
    )));

    expect(container.querySelector('[data-terminal-session-pane-id="a"]')?.contains(hostA))
      .toBe(true);
    expect(container.querySelector('[data-terminal-session-pane-id="b"]')?.contains(hostB))
      .toBe(true);
    expect(hostA.dataset.terminalSessionHostId).toBe("a");
    expect(hostB.dataset.terminalSessionHostId).toBe("b");
    expect(container.querySelector('[data-terminal-session-pane-id="b"]')?.getAttribute("data-focused"))
      .toBe("true");
  });

  it("keeps each Runtime mounted once while Session hosts move", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const runtimeA = createRuntime();
    const runtimeB = createRuntime();
    const runtimes = new Map([["a", runtimeA], ["b", runtimeB]]);
    const horizontal = group(createWorkbenchSplit({
      id: "split-a-b",
      direction: "horizontal",
      ratio: 0.5,
      first: leaf("a"),
      second: leaf("b"),
    }), "a");
    const vertical = group(createWorkbenchSplit({
      id: "split-a-b",
      direction: "vertical",
      ratio: 0.5,
      first: leaf("b"),
      second: leaf("a"),
    }), "b");

    function Harness({ value }: { value: DesktopTerminalGroup }) {
      const hosts = usePersistentTerminalSessionHosts(["a", "b"]);
      return (
        <>
          <TerminalGroupViewport
            dropIntent={null}
            group={value}
            hosts={hosts}
            runtimeRegistry={{ get: (sessionId) => runtimes.get(sessionId) ?? null }}
            onResizeSplit={vi.fn()}
          />
          {["a", "b"].map((sessionId) => createPortal(
            <TerminalSessionHost
              discoveryPhase="ready"
              availableAgentIds={[]}
              focused={value.focusedSessionId === sessionId}
              onFocus={vi.fn()}
              onLaunch={vi.fn()}
              onRefresh={vi.fn()}
              presented
              runtime={runtimes.get(sessionId)!}
              session={{
                id: sessionId,
                launcherId: "shell",
                launchError: null,
                ordinal: sessionId === "a" ? 1 : 2,
                shell: "zsh",
                status: "running",
              }}
              workspacePath="/workspace"
            />,
            hosts.get(sessionId)!,
            sessionId,
          ))}
        </>
      );
    }

    act(() => root?.render(withTestLocalization(<Harness value={horizontal} />)));
    expect(runtimeA.mount).toHaveBeenCalledTimes(1);
    expect(runtimeB.mount).toHaveBeenCalledTimes(1);

    act(() => root?.render(withTestLocalization(<Harness value={vertical} />)));
    expect(runtimeA.mount).toHaveBeenCalledTimes(1);
    expect(runtimeB.mount).toHaveBeenCalledTimes(1);
    expect(runtimeA.unmount).not.toHaveBeenCalled();
    expect(runtimeB.unmount).not.toHaveBeenCalled();
    expect(runtimeA.dispose).not.toHaveBeenCalled();
    expect(runtimeB.dispose).not.toHaveBeenCalled();
  });

  it("renders allowed and rejected four-edge drop previews inside the target leaf", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const hosts = new Map([["a", terminalHost("a")]]);
    const runtimeRegistry = { get: () => createRuntime() };

    const render = (edge: "left" | "right" | "top" | "bottom", allowed: boolean) => act(() => (
      root?.render(withTestLocalization(
        <TerminalGroupViewport
          dropIntent={{ targetSessionId: "a", edge, allowed }}
          group={group(leaf("a"), "a")}
          hosts={hosts}
          runtimeRegistry={runtimeRegistry}
          onResizeSplit={vi.fn()}
        />,
      ))
    ));

    for (const edge of ["left", "right", "top", "bottom"] as const) {
      render(edge, edge !== "top");
      const preview = container.querySelector<HTMLElement>(".desktop-terminal-drop-preview");
      expect(preview?.dataset.edge).toBe(edge);
      expect(preview?.dataset.allowed).toBe(edge === "top" ? "false" : "true");
    }
  });
});

function leaf(sessionId: string): DesktopTerminalLayoutLeaf {
  return Object.freeze({ kind: "session", id: sessionId, sessionId });
}

function group(rootNode: DesktopTerminalGroup["root"], focusedSessionId: string) {
  return Object.freeze({ id: "group", root: rootNode, focusedSessionId });
}

function terminalHost(sessionId: string) {
  const host = document.createElement("div");
  host.dataset.terminalSessionHostId = sessionId;
  return host;
}

function createRuntime(): TerminalRuntimeHandle {
  return {
    activity: false,
    ready: true,
    scrollbarState: {
      visible: false,
      canDecrement: false,
      canIncrement: false,
      position: 0,
      viewportRatio: 1,
    },
    applyAppearance: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    getMinimumViewportSize: vi.fn(() => ({ width: 172, height: 128 })),
    mount: vi.fn(),
    scrollLines: vi.fn(),
    scrollToRatio: vi.fn(),
    setFocused: vi.fn(),
    setPresented: vi.fn(),
    subscribeActivity: vi.fn(() => () => undefined),
    subscribeReady: vi.fn(() => () => undefined),
    subscribeScrollbar: vi.fn(() => () => undefined),
    unmount: vi.fn(),
    write: vi.fn(),
  };
}

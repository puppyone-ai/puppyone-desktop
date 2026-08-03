/**
 * @vitest-environment happy-dom
 */
import React, { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { TerminalRuntimeHandle } from "../src/features/desktop-terminal/runtime/terminalRuntime";
import { TerminalSessionView } from "../src/features/desktop-terminal/ui/TerminalSessionView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Terminal session view lifecycle", () => {
  it("attaches to a manager-owned runtime without disposing it during Strict Mode cleanup", () => {
    const runtime = createRuntime();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(
      <StrictMode>
        <TerminalSessionView
          active
          panelId="terminal-panel-a"
          runtime={runtime}
          workspacePath="/workspace"
        />
      </StrictMode>,
    ));

    expect(runtime.mount).toHaveBeenCalled();
    expect(runtime.setActive).toHaveBeenCalledWith(true);
    expect(runtime.dispose).not.toHaveBeenCalled();
    expect(container.querySelector(".desktop-terminal-session")?.classList.contains("is-ready"))
      .toBe(true);

    act(() => root.unmount());
    expect(runtime.dispose).not.toHaveBeenCalled();
    container.remove();
  });
});

function createRuntime(): TerminalRuntimeHandle {
  return {
    ready: true,
    applyAppearance: vi.fn(),
    dispose: vi.fn(),
    focus: vi.fn(),
    mount: vi.fn(),
    setActive: vi.fn(),
    subscribeReady: vi.fn((listener) => {
      listener(true);
      return () => undefined;
    }),
    write: vi.fn(),
  };
}

/**
 * @vitest-environment happy-dom
 */
import React, { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  EXPLORER_REFERENCE_DRAG_TYPE,
  serializeExplorerReferenceDrag,
} from "@puppyone/shared-ui";
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
          focused
          panelId="terminal-panel-a"
          presented
          runtime={runtime}
          workspacePath="/workspace"
        />
      </StrictMode>,
    ));

    expect(runtime.mount).toHaveBeenCalled();
    expect(runtime.setPresented).toHaveBeenCalledWith(true);
    expect(runtime.setFocused).toHaveBeenCalledWith(true);
    expect(runtime.dispose).not.toHaveBeenCalled();
    expect(container.querySelector(".desktop-terminal-session")?.classList.contains("is-ready"))
      .toBe(true);

    act(() => root.render(
      <TerminalSessionView
        focused={false}
        panelId="terminal-panel-a"
        presented
        runtime={runtime}
        workspacePath="/workspace"
      />,
    ));
    expect(runtime.setPresented).toHaveBeenLastCalledWith(true);
    expect(runtime.setFocused).toHaveBeenLastCalledWith(false);

    act(() => root.unmount());
    expect(runtime.unmount).toHaveBeenCalled();
    expect(runtime.dispose).not.toHaveBeenCalled();
    container.remove();
  });

  it("keeps file-reference drops independent in a presented non-focused pane", () => {
    const runtime = createRuntime();
    const onFocus = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(
      <TerminalSessionView
        focused={false}
        onFocus={onFocus}
        presented
        runtime={runtime}
        workspacePath="/workspace"
      />,
    ));
    const transfer = new DataTransfer();
    transfer.setData(
      EXPLORER_REFERENCE_DRAG_TYPE,
      serializeExplorerReferenceDrag("workspace", [{
        id: "file",
        name: "file name.md",
        path: "folder/file name.md",
        type: "file",
        source: "local",
      }]),
    );
    const target = container.querySelector<HTMLElement>(".desktop-terminal-xterm")!;
    const event = new Event("drop", { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: DataTransfer;
    };
    Object.defineProperty(event, "dataTransfer", { value: transfer });

    act(() => target.dispatchEvent(event));
    expect(runtime.write).toHaveBeenCalledWith("'/workspace/folder/file name.md'");
    expect(runtime.focus).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });
});

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
    unmount: vi.fn(),
    setFocused: vi.fn(),
    setPresented: vi.fn(),
    subscribeActivity: vi.fn((listener) => {
      listener(false);
      return () => undefined;
    }),
    subscribeReady: vi.fn((listener) => {
      listener(true);
      return () => undefined;
    }),
    subscribeScrollbar: vi.fn(() => () => undefined),
    write: vi.fn(),
  };
}

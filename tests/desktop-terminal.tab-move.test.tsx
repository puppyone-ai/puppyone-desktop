/** @vitest-environment happy-dom */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useTerminalTabMoveDrag,
} from "../src/features/desktop-terminal/interactions/useTerminalTabMoveDrag";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Terminal Session tab movement", () => {
  it("does not activate an inactive Session until an ordinary press completes", () => {
    const onActivate = vi.fn();
    const harness = renderHarness({ onActivate });
    const tab = harness.tab;
    installPointerCapture(tab);

    act(() => tab.dispatchEvent(pointer("pointerdown", 1, 10, 10)));
    expect(onActivate).not.toHaveBeenCalled();

    act(() => tab.dispatchEvent(pointer("pointerup", 1, 10, 10)));
    expect(onActivate).toHaveBeenCalledWith("source");
  });

  it("moves one live Session to the nearest pane edge after the threshold", () => {
    const onActivate = vi.fn();
    const onMoveSession = vi.fn();
    const canDrop = vi.fn(() => true);
    const harness = renderHarness({ onActivate, onMoveSession, canDrop });
    installPointerCapture(harness.tab);
    harness.target.getBoundingClientRect = () => new DOMRect(100, 0, 400, 300);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(harness.target);

    act(() => harness.tab.dispatchEvent(pointer("pointerdown", 7, 20, 20)));
    act(() => harness.tab.dispatchEvent(pointer("pointermove", 7, 498, 150)));

    expect(document.body.classList.contains("desktop-terminal-tab-dragging")).toBe(true);
    expect(document.querySelector(".desktop-terminal-tab-move-preview")).not.toBeNull();
    expect(harness.container.querySelector("[data-drop-edge]")?.getAttribute("data-drop-edge"))
      .toBe("right");
    expect(canDrop).toHaveBeenCalledWith("source", "target", "right", harness.target);

    act(() => harness.tab.dispatchEvent(pointer("pointerup", 7, 498, 150)));
    expect(onMoveSession).toHaveBeenCalledWith("source", "target", "right");
    expect(onActivate).not.toHaveBeenCalled();
    expect(document.querySelector(".desktop-terminal-tab-move-preview")).toBeNull();
    expect(document.body.classList.contains("desktop-terminal-tab-dragging")).toBe(false);
  });

  it("shows rejected intent but commits no move", () => {
    const onMoveSession = vi.fn();
    const harness = renderHarness({ onMoveSession, canDrop: () => false });
    installPointerCapture(harness.tab);
    harness.target.getBoundingClientRect = () => new DOMRect(100, 0, 400, 300);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(harness.target);

    act(() => harness.tab.dispatchEvent(pointer("pointerdown", 8, 20, 20)));
    act(() => harness.tab.dispatchEvent(pointer("pointermove", 8, 102, 150)));
    expect(harness.container.querySelector("[data-drop-allowed]")?.getAttribute("data-drop-allowed"))
      .toBe("false");
    act(() => harness.tab.dispatchEvent(pointer("pointerup", 8, 102, 150)));
    expect(onMoveSession).not.toHaveBeenCalled();
  });

  it("clears preview, body state, and native lease on lifecycle cancellation", () => {
    const setPassthrough = vi.fn();
    window.puppyoneDesktop = {
      setNativeSurfacePointerPassthrough: setPassthrough,
    } as NonNullable<typeof window.puppyoneDesktop>;
    const harness = renderHarness();
    installPointerCapture(harness.tab);
    harness.target.getBoundingClientRect = () => new DOMRect(100, 0, 400, 300);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(harness.target);

    act(() => harness.tab.dispatchEvent(pointer("pointerdown", 9, 20, 20)));
    act(() => harness.tab.dispatchEvent(pointer("pointermove", 9, 498, 150)));
    expect(setPassthrough).toHaveBeenLastCalledWith({ active: true });

    act(() => window.dispatchEvent(new Event("blur")));
    expect(setPassthrough).toHaveBeenLastCalledWith({ active: false });
    expect(document.querySelector(".desktop-terminal-tab-move-preview")).toBeNull();
    expect(document.body.classList.contains("desktop-terminal-tab-dragging")).toBe(false);
  });
});

function renderHarness({
  canDrop = () => true,
  onActivate = vi.fn(),
  onMoveSession = vi.fn(),
}: {
  canDrop?: () => boolean;
  onActivate?: (sessionId: string) => void;
  onMoveSession?: (source: string, target: string, edge: string) => void;
} = {}) {
  const container = document.createElement("div");
  const overlay = document.createElement("div");
  overlay.id = "desktop-overlay-root";
  document.body.append(container, overlay);
  root = createRoot(container);

  function Harness() {
    const move = useTerminalTabMoveDrag({
      canDrop,
      onMoveSession,
    });
    return (
      <>
        <button
          data-source-tab
          onPointerDown={(event) => move.start(event, "source", "Terminal source")}
          onPointerMove={move.move}
          onPointerUp={(event) => {
            if (move.end(event) === "press") onActivate("source");
          }}
          onPointerCancel={move.cancel}
          onLostPointerCapture={move.lostCapture}
        >
          source
        </button>
        <div data-terminal-session-pane-id="target" />
        {move.dropIntent && (
          <output
            data-drop-edge={move.dropIntent.edge}
            data-drop-allowed={String(move.dropIntent.allowed)}
          />
        )}
      </>
    );
  }

  act(() => root?.render(<Harness />));
  return {
    container,
    tab: container.querySelector<HTMLButtonElement>("[data-source-tab]")!,
    target: container.querySelector<HTMLElement>("[data-terminal-session-pane-id]")!,
  };
}

function pointer(type: string, pointerId: number, clientX: number, clientY: number) {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
    pointerId,
  });
}

function installPointerCapture(element: HTMLElement) {
  const captured = new Set<number>();
  element.setPointerCapture = (pointerId) => captured.add(pointerId);
  element.hasPointerCapture = (pointerId) => captured.has(pointerId);
  element.releasePointerCapture = (pointerId) => captured.delete(pointerId);
}

/**
 * @vitest-environment happy-dom
 */
import { StrictMode, act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppPreviewController, AppPreviewResult } from "@puppyone/shared-ui";
import { useAppPreviewSession } from "../packages/shared-ui/src/editor/viewers/app-preview/useAppPreviewSession";
import type { AppPreviewMode } from "../packages/shared-ui/src/editor/viewers/app-preview/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  class NoopResizeObserver {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 20,
    left: 10,
    top: 20,
    right: 650,
    bottom: 500,
    width: 640,
    height: 480,
    toJSON: () => ({}),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App Preview attachment lifecycle", () => {
  it("does not invoke any runtime capability while an App is unconfigured", async () => {
    const controller = {
      start: vi.fn(),
      activate: vi.fn(),
      subscribeRuntime: vi.fn(() => () => {}),
      subscribeSurface: vi.fn(() => () => {}),
    } as unknown as AppPreviewController;

    await act(async () => {
      root?.render(<Harness controller={controller} mode="preview" enabled={false} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(controller.start).not.toHaveBeenCalled();
    expect(controller.activate).not.toHaveBeenCalled();
    expect(controller.subscribeRuntime).not.toHaveBeenCalled();
    expect(controller.subscribeSurface).not.toHaveBeenCalled();
  });

  it("uses unique leases and detaches without stopping the workspace runtime", async () => {
    const detachSurface = vi.fn(async () => ({ ok: true }));
    const stop = vi.fn();
    const activate = vi.fn(async ({ attachmentId }) => ({
      runtime: {
        runtimeId: "runtime-1",
        appId: "app-1",
        name: "Demo",
        status: "running" as const,
        path: "demo.puppyoneapp",
        url: "http://127.0.0.1:4173/",
      },
      surface: {
        surfaceId: "surface-1",
        runtimeId: "runtime-1",
        appId: "app-1",
        path: "demo.puppyoneapp",
        status: "ready" as const,
        url: "http://127.0.0.1:4173/",
        title: "Demo",
        canGoBack: false,
        canGoForward: false,
        attached: true,
        attachmentId,
      },
    }));
    const controller = {
      start: vi.fn(),
      activate,
      stop,
      detachSurface,
      setSurfaceBounds: vi.fn(async () => ({ ok: true, visible: true })),
    } as unknown as AppPreviewController;

    await act(async () => {
      root?.render(
        <StrictMode>
          <Harness controller={controller} mode="preview" />
        </StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activate.mock.calls.length).toBeGreaterThanOrEqual(2);
    const attachmentIds = activate.mock.calls.map(([request]) => request.attachmentId);
    expect(new Set(attachmentIds).size).toBe(attachmentIds.length);

    await act(async () => {
      root?.render(
        <StrictMode>
          <Harness controller={controller} mode="source" />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    expect(detachSurface).toHaveBeenCalledWith(expect.objectContaining({
      attachmentId: attachmentIds.at(-1),
    }));
    expect(stop).not.toHaveBeenCalled();
  });

  it("ignores stale runtime generations and out-of-order Pub/Sub snapshots", async () => {
    let runtimeListener: ((state: AppPreviewResult) => void) | null = null;
    const controller = {
      start: vi.fn(),
      activate: vi.fn(async () => ({
        runtime: {
          runtimeId: "runtime-2",
          generation: 2,
          sequence: 2,
          appId: "app-1",
          name: "Demo",
          status: "running" as const,
          path: "demo.puppyoneapp",
          url: "http://127.0.0.1:4173/",
        },
        surface: null,
      })),
      detachSurface: vi.fn(async () => ({ ok: true })),
      subscribeRuntime: vi.fn((listener) => {
        runtimeListener = listener;
        return () => {};
      }),
    } as unknown as AppPreviewController;

    await act(async () => {
      root?.render(<Harness controller={controller} mode="preview" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container?.querySelector("[data-status]")?.getAttribute("data-status")).toBe("running");

    act(() => {
      runtimeListener?.({
        runtimeId: "runtime-1",
        generation: 1,
        sequence: 99,
        appId: "app-1",
        name: "Demo",
        status: "error",
        path: "demo.puppyoneapp",
        message: "old failure",
      });
      runtimeListener?.({
        runtimeId: "runtime-2",
        generation: 2,
        sequence: 1,
        appId: "app-1",
        name: "Demo",
        status: "error",
        path: "demo.puppyoneapp",
        message: "out of order",
      });
    });

    expect(container?.querySelector("[data-status]")?.getAttribute("data-status")).toBe("running");
  });
});

function Harness({
  controller,
  mode,
  enabled = true,
}: {
  controller: AppPreviewController;
  mode: AppPreviewMode;
  enabled?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const session = useAppPreviewSession({
    appPreview: controller,
    path: "demo.puppyoneapp",
    mode,
    hostRef,
    enabled,
  });
  return <div ref={hostRef} data-status={session.state.status} />;
}

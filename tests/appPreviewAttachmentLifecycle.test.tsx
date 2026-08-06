/**
 * @vitest-environment happy-dom
 */
import { StrictMode, act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppPreviewController } from "@puppyone/shared-ui";
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
});

function Harness({
  controller,
  mode,
}: {
  controller: AppPreviewController;
  mode: AppPreviewMode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const session = useAppPreviewSession({
    appPreview: controller,
    path: "demo.puppyoneapp",
    mode,
    hostRef,
  });
  return <div ref={hostRef} data-status={session.state.status} />;
}

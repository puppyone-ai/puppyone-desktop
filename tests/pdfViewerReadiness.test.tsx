/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfResourceViewer } from "../packages/shared-ui/src/editor/viewers/pdf/PdfViewer";
import { withTestLocalization } from "./testLocalization";

const pdfMocks = vi.hoisted(() => {
  let resolveRender!: () => void;
  const renderPromise = new Promise<void>((resolve) => {
    resolveRender = resolve;
  });
  const render = vi.fn(() => ({ promise: renderPromise, cancel: vi.fn() }));
  const destroy = vi.fn(async () => undefined);
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 600 * scale,
          height: 800 * scale,
        }),
        render,
        cleanup: vi.fn(),
      })),
      destroy,
    }),
    destroy,
  }));
  return { destroy, getDocument, render, renderPromise, resolveRender };
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: pdfMocks.getDocument,
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "pdf.worker.js",
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

beforeEach(() => {
  pdfMocks.getDocument.mockClear();
  pdfMocks.render.mockClear();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PDF Viewer readiness", () => {
  it("stays busy until PDF.js finishes the first visible canvas frame", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(withTestLocalization(
      <PdfResourceViewer
        document={{ path: "report.pdf", name: "report.pdf", type: "pdf" }}
        fileUrl="puppyone-local://workspace/report.pdf"
        fileUrlLoading={false}
        fileUrlError={null}
        fileIconTheme="default"
      />,
    )));
    await waitFor(() => pdfMocks.render.mock.calls.length === 1);

    expect(pdfMocks.getDocument).toHaveBeenCalledWith({
      url: "puppyone-local://workspace/report.pdf",
      disableAutoFetch: false,
      disableRange: false,
      disableStream: false,
    });

    const surface = container.querySelector<HTMLElement>(".puppyone-pdf-preview");
    expect(surface?.getAttribute("aria-busy")).toBe("true");
    expect(surface?.dataset.previewState).toBe("loading");
    expect(container.querySelector("iframe")).toBeNull();

    pdfMocks.resolveRender();
    await act(async () => pdfMocks.renderPromise);
    await waitFor(() => surface?.getAttribute("aria-busy") === "false");

    expect(surface?.dataset.previewState).toBe("ready");
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});

async function waitFor(assertion: () => boolean, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (assertion()) return;
    await act(async () => Promise.resolve());
  }
  throw new Error("Timed out waiting for PDF Viewer state.");
}

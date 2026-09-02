import { describe, expect, it, vi } from "vitest";
import { PdfRenderScheduler } from "../packages/shared-ui/src/editor/viewers/pdf/PdfRenderScheduler";
import {
  PDF_RENDER_BUDGET,
  PDF_SAFE_MODE_RENDER_BUDGET,
  resolvePdfCanvasMetrics,
  resolvePdfRenderBudget,
} from "../packages/shared-ui/src/editor/viewers/pdf/pdfRenderPolicy";

describe("PDF resource governance", () => {
  it("caps a high-DPI page by the declared canvas pixel budget", () => {
    const metrics = resolvePdfCanvasMetrics({
      cssWidth: 8_000,
      cssHeight: 12_000,
      devicePixelRatio: 3,
      budget: PDF_RENDER_BUDGET,
    });

    expect(metrics.pixels).toBeLessThanOrEqual(PDF_RENDER_BUDGET.maxCanvasPixels);
    expect(metrics.outputScale).toBeLessThan(1);
    expect(PDF_SAFE_MODE_RENDER_BUDGET.maxResidentCanvases)
      .toBeLessThan(PDF_RENDER_BUDGET.maxResidentCanvases);
    expect(resolvePdfRenderBudget({
      maxCanvasPixels: 4_000_000,
      maxActiveCanvases: 4,
    }, false)).toMatchObject({
      maxCanvasPixels: 4_000_000,
      maxResidentCanvases: 4,
    });
  });

  it("bounds concurrent page renders and drops an aborted queued render", async () => {
    const scheduler = new PdfRenderScheduler(2);
    const releases: Array<() => void> = [];
    const run = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
    const first = scheduler.schedule(run, new AbortController().signal);
    const second = scheduler.schedule(run, new AbortController().signal);
    const queuedController = new AbortController();
    const queued = scheduler.schedule(run, queuedController.signal);

    expect(run).toHaveBeenCalledTimes(2);
    queuedController.abort();
    await expect(queued).rejects.toMatchObject({ name: "AbortError" });
    expect(run).toHaveBeenCalledTimes(2);

    releases.splice(0).forEach((release) => release());
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });
});

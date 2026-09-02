"use client";

import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { DocumentSurfacePending } from "../../host/DocumentSurfaceHost";
import {
  ResourcePreviewState,
  type ResourceViewerProps,
} from "../media/ResourceViewers";
import { PdfRenderScheduler } from "./PdfRenderScheduler";
import {
  resolvePdfCanvasMetrics,
  resolvePdfRenderBudget,
  type PdfRenderBudget,
} from "./pdfRenderPolicy";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const EMPTY_PDF_RESOURCE_POLICY = Object.freeze({});

export function PdfResourceViewer({
  document,
  fileUrl,
  fileUrlLoading,
  fileUrlError,
}: ResourceViewerProps) {
  return (
    <ResourcePreviewState
      fileUrl={fileUrl}
      loading={fileUrlLoading}
      error={fileUrlError}
      kind="pdf"
    >
      {(url) => <PdfDocumentPreview url={url} title={document.name} />}
    </ResourcePreviewState>
  );
}

export function PdfDocumentPreview({
  url,
  title,
  safeMode = false,
  resourcePolicy = EMPTY_PDF_RESOURCE_POLICY,
}: {
  url: string;
  title: string;
  safeMode?: boolean;
  resourcePolicy?: Readonly<{
    maxCanvasPixels?: number;
    maxActiveCanvases?: number;
  }>;
}) {
  const { t } = useLocalization();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const markFirstPageReady = useCallback(() => setFirstPageReady(true), []);
  const budget = useMemo(
    () => resolvePdfRenderBudget(resourcePolicy, safeMode),
    [resourcePolicy.maxActiveCanvases, resourcePolicy.maxCanvasPixels, safeMode],
  );

  useEffect(() => {
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let disposed = false;

    setPdf(null);
    setLoadError(null);
    setFirstPageReady(false);

    try {
      loadingTask = getDocument({
        url,
        disableAutoFetch: false,
        disableRange: false,
        disableStream: false,
      });
      void loadingTask.promise.then((loadedDocument) => {
        if (disposed) return;
        setPdf(loadedDocument);
      }, (reason) => {
        if (disposed) return;
        setLoadError(reason instanceof Error ? reason.message : String(reason));
      });
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : String(reason));
    }

    return () => {
      disposed = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [url]);

  if (loadError) {
    return (
      <div className="editor-state danger">
        {t("editor.resource.loadFailed", {
          kind: t("editor.resource.kind.pdf"),
          detail: bidiIsolate(loadError),
        })}
      </div>
    );
  }

  return (
    <div
      className="native-preview puppyone-pdf-preview"
      data-po-scrollbar="content"
      data-pdf-url={url}
      data-pdf-safe-mode={safeMode ? "true" : undefined}
      data-preview-state={firstPageReady ? "ready" : "loading"}
      aria-label={title}
      aria-busy={!firstPageReady}
    >
      {!pdf ? <DocumentSurfacePending label={t("editor.preview.loading")} /> : null}
      {pdf ? (
        <PdfPages
          pdf={pdf}
          budget={budget}
          onFirstPageReady={markFirstPageReady}
        />
      ) : null}
    </div>
  );
}

function PdfPages({
  pdf,
  budget,
  onFirstPageReady,
}: {
  pdf: PDFDocumentProxy;
  budget: PdfRenderBudget;
  onFirstPageReady: () => void;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [nearPages, setNearPages] = useState<ReadonlyMap<number, number>>(
    () => new Map([[1, 0]]),
  );
  const scheduler = useMemo(
    () => new PdfRenderScheduler(budget.maxConcurrentRenders),
    [budget.maxConcurrentRenders],
  );
  const activePages = useMemo(() => new Set(
    [...nearPages.entries()]
      .sort((left, right) => left[1] - right[1] || left[0] - right[0])
      .slice(0, budget.maxResidentCanvases)
      .map(([pageNumber]) => pageNumber),
  ), [budget.maxResidentCanvases, nearPages]);
  const reportProximity = useCallback((pageNumber: number, distance: number | null) => {
    setNearPages((current) => {
      const previous = current.get(pageNumber);
      if (distance === null && previous === undefined) return current;
      if (distance !== null && previous === distance) return current;
      const next = new Map(current);
      if (distance === null) next.delete(pageNumber);
      else next.set(pageNumber, distance);
      return next;
    });
  }, []);

  return (
    <div ref={scrollRootRef} className="puppyone-pdf-pages">
      {Array.from({ length: pdf.numPages }, (_, index) => {
        const pageNumber = index + 1;
        return (
          <PdfPageCanvas
            key={pageNumber}
            active={activePages.has(pageNumber)}
            budget={budget}
            pdf={pdf}
            pageNumber={pageNumber}
            scheduler={scheduler}
            scrollRootRef={scrollRootRef}
            onProximityChange={reportProximity}
            onRendered={pageNumber === 1 ? onFirstPageReady : undefined}
          />
        );
      })}
    </div>
  );
}

function PdfPageCanvas({
  active,
  budget,
  pdf,
  pageNumber,
  scheduler,
  scrollRootRef,
  onProximityChange,
  onRendered,
}: {
  active: boolean;
  budget: PdfRenderBudget;
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scheduler: PdfRenderScheduler;
  scrollRootRef: RefObject<HTMLDivElement>;
  onProximityChange: (pageNumber: number, distance: number | null) => void;
  onRendered?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderWidth, setRenderWidth] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(612 / 792);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === "undefined") {
      onProximityChange(pageNumber, pageNumber === 1 ? 0 : pageNumber);
      return () => onProximityChange(pageNumber, null);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) {
        onProximityChange(pageNumber, null);
        return;
      }
      const rootTop = entry.rootBounds?.top ?? 0;
      onProximityChange(pageNumber, Math.round(Math.abs(entry.boundingClientRect.top - rootTop)));
    }, {
      root: scrollRootRef.current,
      rootMargin: `${budget.overscanPixels}px 0px`,
    });
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
      onProximityChange(pageNumber, null);
    };
  }, [budget.overscanPixels, onProximityChange, pageNumber, scrollRootRef]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const width = Math.floor(wrapper.clientWidth);
      setRenderWidth((current) => Math.abs(current - width) < 2 ? current : width);
    };
    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(measure);
    };
    scheduleMeasure();
    if (typeof ResizeObserver === "undefined") {
      return () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || renderWidth <= 0 || !canvas) {
      if (canvas) releaseCanvas(canvas);
      setRendered(false);
      return undefined;
    }

    const controller = new AbortController();
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    setRenderError(null);
    setRendered(false);

    void scheduler.schedule(async () => {
      page = await pdf.getPage(pageNumber);
      if (controller.signal.aborted) throw createAbortError();

      const baseViewport = page.getViewport({ scale: 1 });
      setAspectRatio(baseViewport.width / baseViewport.height);
      const availableWidth = Math.max(1, renderWidth - 32);
      const cssScale = Math.min(2, availableWidth / baseViewport.width);
      const viewport = page.getViewport({ scale: cssScale });
      const metrics = resolvePdfCanvasMetrics({
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        devicePixelRatio: window.devicePixelRatio || 1,
        budget,
      });
      canvas.width = metrics.width;
      canvas.height = metrics.height;
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTask = page.render({
        canvas,
        viewport,
        transform: metrics.outputScale === 1
          ? undefined
          : [metrics.outputScale, 0, 0, metrics.outputScale, 0, 0],
        background: "rgb(255, 255, 255)",
      });
      await renderTask.promise;
      if (controller.signal.aborted) throw createAbortError();

      setRendered(true);
      if (!renderedRef.current) {
        renderedRef.current = true;
        onRendered?.();
      }
    }, controller.signal, pageNumber === 1 ? 100 : 0).catch((reason) => {
      if (controller.signal.aborted || isRenderCancellation(reason)) return;
      releaseCanvas(canvas);
      setRenderError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      page?.cleanup();
    });

    return () => {
      controller.abort();
      renderTask?.cancel();
      page?.cleanup();
      releaseCanvas(canvas);
    };
  }, [active, budget, onRendered, pageNumber, pdf, renderWidth, scheduler]);

  const style = { "--pdf-page-aspect-ratio": aspectRatio } as CSSProperties;
  return (
    <div
      ref={wrapperRef}
      className="puppyone-pdf-page"
      data-page-number={pageNumber}
      data-page-state={renderError ? "error" : rendered ? "ready" : "loading"}
      style={style}
    >
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
      {renderError ? <span className="puppyone-pdf-page-error" dir="ltr">{renderError}</span> : null}
    </div>
  );
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
  canvas.style.width = "";
  canvas.style.height = "";
}

function createAbortError() {
  return new DOMException("PDF render was superseded.", "AbortError");
}

function isRenderCancellation(reason: unknown): boolean {
  return reason instanceof Error && (
    reason.name === "RenderingCancelledException"
    || reason.name === "AbortError"
  );
}

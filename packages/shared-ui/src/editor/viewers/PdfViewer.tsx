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
  useRef,
  useState,
  type RefObject,
} from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { DocumentSurfacePending } from "../DocumentSurfaceHost";
import {
  ResourcePreviewState,
  type ResourceViewerProps,
} from "./ResourceViewers";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

function PdfDocumentPreview({ url, title }: { url: string; title: string }) {
  const { t } = useLocalization();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const markFirstPageReady = useCallback(() => setFirstPageReady(true), []);

  useEffect(() => {
    const controller = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;
    let disposed = false;

    setPdf(null);
    setLoadError(null);
    setFirstPageReady(false);

    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (disposed) return;

        loadingTask = getDocument({
          data: bytes,
        });
        loadedDocument = await loadingTask.promise;
        if (disposed) return;
        setPdf(loadedDocument);
      } catch (reason) {
        if (disposed || controller.signal.aborted) return;
        setLoadError(reason instanceof Error ? reason.message : String(reason));
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
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
      data-preview-state={firstPageReady ? "ready" : "loading"}
      aria-label={title}
      aria-busy={!firstPageReady}
    >
      {!pdf ? <DocumentSurfacePending label={t("editor.preview.loading")} /> : null}
      {pdf ? (
        <PdfPages
          pdf={pdf}
          onFirstPageReady={markFirstPageReady}
        />
      ) : null}
    </div>
  );
}

function PdfPages({
  pdf,
  onFirstPageReady,
}: {
  pdf: PDFDocumentProxy;
  onFirstPageReady: () => void;
}) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={scrollRootRef} className="puppyone-pdf-pages">
      {Array.from({ length: pdf.numPages }, (_, index) => {
        const pageNumber = index + 1;
        return (
          <PdfPageCanvas
            key={pageNumber}
            pdf={pdf}
            pageNumber={pageNumber}
            scrollRootRef={scrollRootRef}
            onRendered={pageNumber === 1 ? onFirstPageReady : undefined}
          />
        );
      })}
    </div>
  );
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  scrollRootRef,
  onRendered,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scrollRootRef: RefObject<HTMLDivElement>;
  onRendered?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(pageNumber === 1);
  const [renderWidth, setRenderWidth] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (active) return undefined;
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === "undefined") {
      setActive(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setActive(true);
        observer.disconnect();
      }
    }, {
      root: scrollRootRef.current,
      rootMargin: "800px 0px",
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [active, scrollRootRef]);

  const measure = useCallback(() => {
    const width = Math.floor(wrapperRef.current?.clientWidth ?? 0);
    setRenderWidth((current) => current === width ? current : width);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!active || renderWidth <= 0) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    const nextCanvas = document.createElement("canvas");
    setRenderError(null);
    setRendered(false);

    void (async () => {
      try {
        page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(1, renderWidth - 32);
        const cssScale = Math.min(2, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale: cssScale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        nextCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        nextCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));

        renderTask = page.render({
          canvas: nextCanvas,
          viewport,
          transform: outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
          background: "rgb(255, 255, 255)",
        });
        await renderTask.promise;
        if (cancelled) return;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF canvas context is unavailable.");
        canvas.width = nextCanvas.width;
        canvas.height = nextCanvas.height;
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.drawImage(nextCanvas, 0, 0);
        setRenderError(null);
        setRendered(true);
        if (!renderedRef.current) {
          renderedRef.current = true;
          onRendered?.();
        }
      } catch (reason) {
        if (cancelled || isRenderCancellation(reason)) return;
        setRenderError(reason instanceof Error ? reason.message : String(reason));
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      page?.cleanup();
      nextCanvas.width = 0;
      nextCanvas.height = 0;
    };
  }, [active, onRendered, pageNumber, pdf, renderWidth]);

  return (
    <div
      ref={wrapperRef}
      className="puppyone-pdf-page"
      data-page-number={pageNumber}
      data-page-state={renderError ? "error" : rendered ? "ready" : "loading"}
    >
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
      {renderError ? <span className="puppyone-pdf-page-error" dir="ltr">{renderError}</span> : null}
    </div>
  );
}

function isRenderCancellation(reason: unknown): boolean {
  return reason instanceof Error && reason.name === "RenderingCancelledException";
}

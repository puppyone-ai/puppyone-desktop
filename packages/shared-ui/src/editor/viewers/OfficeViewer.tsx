"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PptxViewer, SlideHandle } from "@aiden0z/pptx-renderer";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { FileGlyphIcon } from "../../file/fileIcons";
import {
  assertDocxDomWithinBudget,
  CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE,
  getControlledDocxExternalHref,
  sanitizeDocxDom,
} from "../security/docxDomSanitizer";
import { validateOfficePackageInWorker } from "../security/officePackageValidationClient";
import {
  preflightOoxmlPackage,
  preflightZipCentralDirectory,
  ZipPreflightError,
} from "../security/zipCentralDirectoryPreflight";
import type { PresetViewerRenderContext } from "../viewerTypes";
import {
  fetchOfficeArrayBuffer,
  OfficeResourceLimitError,
} from "./officeResourceLoader";
import { extractOfficeTextFallbackInWorker } from "./officeTextFallbackClient";
import {
  getSpreadsheetArchiveKind,
  getSpreadsheetRenderRows,
  type SpreadsheetPreviewResult,
  type SpreadsheetSheet,
} from "./spreadsheetPreview";
import { parseSpreadsheetInWorker } from "./spreadsheetPreviewClient";

type OfficeState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: OfficePreviewResult };

type OfficePreviewResult =
  | { kind: "word"; arrayBuffer: ArrayBuffer }
  | SpreadsheetPreviewResult
  | { kind: "presentation"; arrayBuffer: ArrayBuffer }
  | { kind: "presentationText"; slides: PresentationSlide[]; truncatedSlideCount: number }
  | { kind: "opendocument"; title: string; lines: string[]; truncatedLines: boolean }
  | OfficeUnsupportedResult;

type OfficeUnsupportedCode =
  | "conversion-failed"
  | "legacy-presentation"
  | "resource-unavailable"
  | "resource-rejected"
  | "unsafe-package"
  | "unsupported-format"
  | "legacy-word"
  | "rich-text-converter";

type OfficePackageSubject =
  | "converted-word"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "opendocument"
  | "office";

type OfficeUnsupportedResult = {
  kind: "unsupported";
  code: OfficeUnsupportedCode;
  detail?: string | null;
  extension?: string;
  subject?: OfficePackageSubject;
};

type PresentationSlide = {
  index: number;
  title: string | null;
  lines: string[];
};

const SPREADSHEET_ROW_HEIGHT = 30;
const SPREADSHEET_OVERSCAN_ROWS = 12;
const LEGACY_WORD_EXTENSIONS = new Set(["doc"]);
const LEGACY_PRESENTATION_EXTENSIONS = new Set(["ppt", "pps"]);
const NATIVE_DOCX_CONVERTIBLE_EXTENSIONS = new Set(["doc", "rtf"]);
const OOXML_PACKAGE_EXTENSIONS = new Set(["docx", "xlsx", "xlsb", "xlsm", "pptx", "ppsx"]);
const OPEN_DOCUMENT_PACKAGE_EXTENSIONS = new Set(["odt", "ods", "odp", "ott", "ots", "otp"]);
const DOCX_DECOMPRESSION_BUDGET = {
  maxEntryUncompressedBytes: 32 * 1024 * 1024,
  maxTotalUncompressedBytes: 128 * 1024 * 1024,
  maxDocxXmlStartTags: 150_000,
} as const;
const PRESENTATION_DECOMPRESSION_BUDGET = {
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 192 * 1024 * 1024,
} as const;
const OPEN_DOCUMENT_DECOMPRESSION_BUDGET = {
  maxEntryUncompressedBytes: 16 * 1024 * 1024,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
} as const;

type OfficeViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "resolvedExtension"
  | "fileUrl"
  | "fileUrlLoading"
  | "fileUrlError"
  | "openExternalFile"
  | "convertOfficeDocumentToDocx"
  | "markdownLinkGraph"
  | "fileIconTheme"
>;

export function OfficeViewer({
  document,
  resolvedExtension,
  fileUrl,
  fileUrlLoading,
  fileUrlError,
  openExternalFile,
  convertOfficeDocumentToDocx,
  markdownLinkGraph,
  fileIconTheme,
}: OfficeViewerProps) {
  const { t } = useLocalization();
  const [state, setState] = useState<OfficeState>({ status: "idle" });
  const [activeSheet, setActiveSheet] = useState(0);
  const extension = resolvedExtension ?? getExtension(document.name);
  const canUseNativeDocxConversion = Boolean(
    convertOfficeDocumentToDocx && NATIVE_DOCX_CONVERTIBLE_EXTENSIONS.has(extension),
  );
  const surfaceKind = getOfficePreviewSurfaceKind(extension);
  const previewResourceUrl = canUseNativeDocxConversion ? null : fileUrl;
  const previewResourceLoading = canUseNativeDocxConversion ? false : fileUrlLoading;

  useEffect(() => {
    setActiveSheet(0);
  }, [document.path]);

  useEffect(() => {
    if (!previewResourceUrl && !canUseNativeDocxConversion) {
      setState(previewResourceLoading ? { status: "loading" } : { status: "idle" });
      return undefined;
    }

    let cancelled = false;
    const abortController = new AbortController();

    setState({ status: "loading" });
    loadOfficePreview({
      fileUrl: previewResourceUrl,
      filename: document.name,
      extension,
      path: document.path,
      convertOfficeDocumentToDocx,
      signal: abortController.signal,
    })
      .then((result) => {
        if (!cancelled) setState({ status: "ready", result });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [canUseNativeDocxConversion, convertOfficeDocumentToDocx, document.name, document.path, extension, previewResourceLoading, previewResourceUrl]);

  let previewBody: ReactNode;
  if (fileUrlError && !canUseNativeDocxConversion) {
    previewBody = (
      <OfficeEmptyState
        title={t("editor.office.loadFailed")}
        message={fileUrlError}
        documentPath={document.path}
        openExternalFile={openExternalFile}
      />
    );
  } else if (
    (previewResourceLoading || state.status === "loading")
    && !previewResourceUrl
    && !canUseNativeDocxConversion
  ) {
    previewBody = <div className="editor-state">{t("editor.preview.loading")}</div>;
  } else if (!previewResourceUrl && !canUseNativeDocxConversion && state.status !== "ready") {
    previewBody = (
      <OfficeEmptyState
        title={t("editor.preview.unavailable")}
        message={t("editor.office.resourceUnavailable")}
        documentPath={document.path}
        openExternalFile={openExternalFile}
      />
    );
  } else {
    previewBody = (
      <>
        {state.status === "error" && (
          <OfficeEmptyState
            title={t("editor.preview.failed")}
            message={state.message}
            documentPath={document.path}
            openExternalFile={openExternalFile}
          />
        )}
        {state.status === "idle" || state.status === "loading" ? (
          <div className="editor-state">{t("editor.preview.loading")}</div>
        ) : null}
        {state.status === "ready" && (
          <OfficePreviewContent
            documentPath={document.path}
            result={state.result}
            activeSheet={activeSheet}
            onActiveSheetChange={setActiveSheet}
            openExternalFile={openExternalFile}
            openExternalUrl={markdownLinkGraph?.openExternalUrl}
          />
        )}
      </>
    );
  }

  return (
    <div className="office-preview" data-office-kind={surfaceKind}>
      <OfficePreviewHeader
        documentName={document.name}
        documentPath={document.path}
        extension={extension}
        fileIconTheme={fileIconTheme}
        openExternalFile={openExternalFile}
      />
      <div className="office-preview__body">
        {previewBody}
      </div>
    </div>
  );
}

function OfficePreviewHeader({
  documentName,
  documentPath,
  extension,
  fileIconTheme,
  openExternalFile,
}: {
  documentName: string;
  documentPath: string;
  extension: string;
  fileIconTheme?: OfficeViewerProps["fileIconTheme"];
  openExternalFile?: (path: string) => Promise<void>;
}) {
  const { t } = useLocalization();
  const [externalOpenError, setExternalOpenError] = useState<string | null>(null);
  const openExternally = () => {
    if (!openExternalFile) return;
    setExternalOpenError(null);
    void Promise.resolve().then(() => openExternalFile(documentPath)).catch((error) => {
      setExternalOpenError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <header className="office-preview__header">
      <div className="office-preview__identity">
        <FileGlyphIcon name={documentName} size={16} theme={fileIconTheme} />
        <strong dir="auto" title={documentName}>{documentName}</strong>
        <span className="office-preview__format">{extension.toUpperCase()}</span>
        <span className="office-preview__mode">{t("editor.office.preview")}</span>
      </div>
      <div className="office-preview__header-actions">
        {externalOpenError && (
          <span className="office-preview__header-error" role="alert" dir="auto">
            {t("editor.office.openDesktopFailed", { detail: bidiIsolate(externalOpenError) })}
          </span>
        )}
        {openExternalFile && (
          <button
            type="button"
            className="office-preview__toolbar-button"
            aria-label={t("editor.openDefaultApp")}
            title={t("editor.openDefaultApp")}
            onClick={openExternally}
          >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </header>
  );
}

function OfficePreviewContent({
  documentPath,
  result,
  activeSheet,
  onActiveSheetChange,
  openExternalFile,
  openExternalUrl,
}: {
  documentPath: string;
  result: OfficePreviewResult;
  activeSheet: number;
  onActiveSheetChange: (index: number) => void;
  openExternalFile?: (path: string) => Promise<void>;
  openExternalUrl?: (href: string) => void | Promise<void>;
}) {
  const { t } = useLocalization();
  if (result.kind === "unsupported") {
    return (
      <OfficeEmptyState
        title={t("editor.preview.unavailable")}
        message={formatOfficeUnsupported(result, t)}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  if (result.kind === "word") {
    return (
      <DocxDocumentPreview
        arrayBuffer={result.arrayBuffer}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
        openExternalUrl={openExternalUrl}
      />
    );
  }

  if (result.kind === "spreadsheet") {
    return (
      <SpreadsheetPreview
        result={result}
        activeSheet={activeSheet}
        onActiveSheetChange={onActiveSheetChange}
      />
    );
  }

  if (result.kind === "presentation") {
    return (
      <PptxPresentationPreview
        arrayBuffer={result.arrayBuffer}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  if (result.kind === "presentationText") {
    return (
      <PresentationTextPreview
        slides={result.slides}
        truncatedSlideCount={result.truncatedSlideCount}
      />
    );
  }

  return (
    <div className="office-document-preview" data-po-scrollbar="content">
      <article className="office-document-page">
        <h1 dir="auto">{result.title}</h1>
        {result.lines.length > 0 ? (
          result.lines.map((line, index) => <p dir="auto" key={`${line}-${index}`}>{line}</p>)
        ) : (
          <p>{t("editor.office.noReadableText")}</p>
        )}
        {result.truncatedLines && (
          <div className="office-preview__note">{t("editor.office.firstExtractedLines", { count: 400 })}</div>
        )}
      </article>
    </div>
  );
}

function PresentationTextPreview({
  slides,
  truncatedSlideCount = 0,
}: {
  slides: PresentationSlide[];
  truncatedSlideCount?: number;
}) {
  const { formatNumber, t } = useLocalization();
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    setActiveSlide(0);
  }, [slides]);

  if (slides.length === 0) {
    return (
      <OfficeEmptyState
        title={t("editor.office.emptyPresentation")}
        message={t("editor.office.noSlideText")}
      />
    );
  }

  const selectedSlide = slides[Math.min(activeSlide, slides.length - 1)];

  return (
    <div className="office-presentation-preview office-presentation-preview--text">
      {truncatedSlideCount > 0 && (
        <div className="office-preview__note">
          {t("editor.office.omittedSlidesSafety", { count: truncatedSlideCount })}
        </div>
      )}
      <div className="office-pptx-workspace">
        <aside
          className="office-pptx-thumbnail-rail office-pptx-thumbnail-rail--text"
          data-po-scrollbar="content"
          role="tablist"
          aria-label={t("editor.office.slides")}
        >
          {slides.map((slide, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={index === activeSlide}
              aria-label={t("editor.office.slideNumber", { number: slide.index })}
              className="office-pptx-text-thumbnail"
              key={slide.index}
              onClick={() => setActiveSlide(index)}
            >
              <span>{formatNumber(slide.index)}</span>
              <strong dir="auto">
                {slide.title ?? t("editor.office.slideNumber", { number: slide.index })}
              </strong>
            </button>
          ))}
        </aside>
        <div className="office-pptx-stage">
          <article className="office-pptx-text-slide">
            <h2 dir="auto">
              {selectedSlide.title ?? t("editor.office.slideNumber", { number: selectedSlide.index })}
            </h2>
            {selectedSlide.lines.length > 0 ? (
              <ul>
                {selectedSlide.lines.map((line, index) => (
                  <li dir="auto" key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>{t("editor.office.noSlideReadableText")}</p>
            )}
          </article>
          <PresentationNavigation
            activeSlide={activeSlide}
            slideCount={slides.length}
            onSelect={setActiveSlide}
          />
        </div>
      </div>
    </div>
  );
}

function PptxPresentationPreview({
  arrayBuffer,
  documentPath,
  openExternalFile,
}: {
  arrayBuffer: ArrayBuffer;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
}) {
  const { t } = useLocalization();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const thumbnailRailRef = useRef<HTMLElement | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [renderState, setRenderState] = useState<
    | { status: "loading" | "ready" }
    | {
      status: "fallback";
      detail: string;
      slides: PresentationSlide[];
      truncatedSlideCount: number;
    }
    | { status: "error"; renderDetail: string; fallbackDetail: string }
  >({ status: "loading" });
  const [viewerState, setViewerState] = useState<{
    viewer: PptxViewer;
    slideCount: number;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const abortController = new AbortController();
    let cancelled = false;
    let viewer: PptxViewer | null = null;

    host.replaceChildren();
    setActiveSlide(0);
    setRenderState({ status: "loading" });
    setViewerState(null);

    import("@aiden0z/pptx-renderer")
      .then(({ PptxViewer, RECOMMENDED_ZIP_LIMITS }) => PptxViewer.open(arrayBuffer.slice(0), host, {
        fitMode: "contain",
        lazyMedia: true,
        lazySlides: true,
        pdfjs: false,
        renderMode: "slide",
        signal: abortController.signal,
        zipLimits: RECOMMENDED_ZIP_LIMITS,
        onSlideChange: (index) => {
          if (!cancelled) setActiveSlide(index);
        },
      }))
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        viewer = nextViewer;
        setActiveSlide(nextViewer.currentSlideIndex);
        setViewerState({ viewer: nextViewer, slideCount: nextViewer.slideCount });
        setRenderState({ status: "ready" });
      })
      .catch(async (error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        try {
          const fallback = await parsePresentationText(arrayBuffer.slice(0), abortController.signal);
          if (!cancelled && fallback.kind === "presentationText") {
            setRenderState({
              status: "fallback",
              detail: message,
              slides: fallback.slides,
              truncatedSlideCount: fallback.truncatedSlideCount,
            });
          }
        } catch (fallbackError) {
          if (!cancelled) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            setRenderState({
              status: "error",
              renderDetail: message,
              fallbackDetail: fallbackMessage,
            });
          }
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      viewer?.destroy();
      host.replaceChildren();
    };
  }, [arrayBuffer]);

  useEffect(() => {
    if (!thumbnailRailRef.current) return;
    const activeButton = thumbnailRailRef.current.querySelector<HTMLElement>(
      `[data-slide-index="${activeSlide}"]`,
    );
    activeButton?.scrollIntoView({ block: "nearest" });
  }, [activeSlide]);

  if (renderState.status === "fallback") {
    return (
      <div className="office-pptx-render-preview">
        <div className="office-preview__note">
          {t("editor.office.pptxFallback", { detail: bidiIsolate(renderState.detail) })}
        </div>
        <PresentationTextPreview
          slides={renderState.slides}
          truncatedSlideCount={renderState.truncatedSlideCount}
        />
      </div>
    );
  }

  if (renderState.status === "error") {
    return (
      <OfficeEmptyState
        title={t("editor.preview.failed")}
        message={t("editor.office.pptxFailed", {
          renderDetail: bidiIsolate(renderState.renderDetail),
          fallbackDetail: bidiIsolate(renderState.fallbackDetail),
        })}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <div className="office-pptx-render-preview">
      <div className="office-pptx-workspace">
        <aside
          ref={thumbnailRailRef}
          className="office-pptx-thumbnail-rail"
          data-po-scrollbar="content"
          role="tablist"
          aria-label={t("editor.office.slides")}
        >
          {viewerState && Array.from({ length: viewerState.slideCount }, (_, index) => (
            <PptxThumbnail
              key={index}
              viewer={viewerState.viewer}
              slideIndex={index}
              active={index === activeSlide}
              scrollRoot={thumbnailRailRef.current}
              onSelect={() => void viewerState.viewer.goToSlide(index)}
            />
          ))}
        </aside>
        <div className="office-pptx-stage">
          <div
            ref={hostRef}
            className="office-pptx-render-host"
            data-po-scrollbar="content"
            data-rendering={renderState.status === "loading" ? "true" : undefined}
          />
          {renderState.status === "loading" && (
            <div className="office-pptx-render-state">{t("editor.office.renderingPresentation")}</div>
          )}
          {viewerState?.slideCount === 0 && (
            <div className="office-pptx-render-state">{t("editor.office.emptyPresentation")}</div>
          )}
          {viewerState && viewerState.slideCount > 0 && (
            <PresentationNavigation
              activeSlide={activeSlide}
              slideCount={viewerState.slideCount}
              onSelect={(index) => void viewerState.viewer.goToSlide(index)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PptxThumbnail({
  viewer,
  slideIndex,
  active,
  scrollRoot,
  onSelect,
}: {
  viewer: PptxViewer;
  slideIndex: number;
  active: boolean;
  scrollRoot: HTMLElement | null;
  onSelect: () => void;
}) {
  const { formatNumber, t } = useLocalization();
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let handle: SlideHandle | null = null;
    let observer: IntersectionObserver | null = null;
    let disposed = false;

    const renderThumbnail = () => {
      if (disposed || handle) return;
      const width = Math.max(72, host.clientWidth || 112);
      handle = viewer.renderThumbnailToContainer(slideIndex, host, { width });
      void handle?.ready.catch(() => undefined);
      observer?.disconnect();
    };

    if (typeof IntersectionObserver === "undefined") {
      renderThumbnail();
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) renderThumbnail();
      }, {
        root: scrollRoot,
        rootMargin: "240px 0px",
      });
      observer.observe(host);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      handle?.dispose();
      host.replaceChildren();
    };
  }, [scrollRoot, slideIndex, viewer]);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={t("editor.office.slideNumber", { number: slideIndex + 1 })}
      className="office-pptx-thumbnail"
      data-slide-index={slideIndex}
      onClick={onSelect}
    >
      <span className="office-pptx-thumbnail__number">{formatNumber(slideIndex + 1)}</span>
      <span className="office-pptx-thumbnail__frame" ref={hostRef} aria-hidden="true" />
    </button>
  );
}

function PresentationNavigation({
  activeSlide,
  slideCount,
  onSelect,
}: {
  activeSlide: number;
  slideCount: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useLocalization();
  return (
    <div className="office-pptx-navigation">
      <button
        type="button"
        aria-label={t("editor.office.previousSlide")}
        disabled={activeSlide <= 0}
        onClick={() => onSelect(Math.max(0, activeSlide - 1))}
      >
        <ChevronLeft size={15} strokeWidth={2} />
      </button>
      <span>{t("editor.office.slidePosition", { current: activeSlide + 1, total: slideCount })}</span>
      <button
        type="button"
        aria-label={t("editor.office.nextSlide")}
        disabled={activeSlide >= slideCount - 1}
        onClick={() => onSelect(Math.min(slideCount - 1, activeSlide + 1))}
      >
        <ChevronRight size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

function SpreadsheetPreview({
  result,
  activeSheet,
  onActiveSheetChange,
}: {
  result: Extract<OfficePreviewResult, { kind: "spreadsheet" }>;
  activeSheet: number;
  onActiveSheetChange: (index: number) => void;
}) {
  const { formatList, formatNumber, t } = useLocalization();
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  const selectedSheet = result.sheets[Math.min(activeSheet, result.sheets.length - 1)];

  useEffect(() => {
    const gridWrap = gridWrapRef.current;
    if (!gridWrap) return undefined;

    gridWrap.scrollTop = 0;
    const updateViewport = () => {
      setViewport({
        scrollTop: gridWrap.scrollTop,
        height: gridWrap.clientHeight,
      });
    };
    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(gridWrap);
    updateViewport();
    return () => {
      resizeObserver.disconnect();
    };
  }, [selectedSheet?.name]);

  if (result.sheets.length === 0 || !selectedSheet) {
    const hiddenMessage = result.hiddenSheetCount > 0
      ? t("editor.office.hiddenSheetsOmitted", { count: result.hiddenSheetCount })
      : t("editor.office.noSheets");
    return <OfficeEmptyState title={t("editor.office.noVisibleSheets")} message={hiddenMessage} />;
  }

  const rowCount = selectedSheet.rows.length;
  const visibleRowCount = viewport.height > 0
    ? Math.ceil(viewport.height / SPREADSHEET_ROW_HEIGHT) + (SPREADSHEET_OVERSCAN_ROWS * 2)
    : 60;
  const startRow = Math.max(0, Math.floor(viewport.scrollTop / SPREADSHEET_ROW_HEIGHT) - SPREADSHEET_OVERSCAN_ROWS);
  const endRow = Math.min(rowCount, startRow + visibleRowCount);
  const topSpacerHeight = startRow * SPREADSHEET_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (rowCount - endRow) * SPREADSHEET_ROW_HEIGHT);
  const renderedRows = getSpreadsheetRenderRows(selectedSheet, startRow, endRow);
  const columnSpan = selectedSheet.columns.length + 1;
  const previewNotes = createSpreadsheetPreviewNotes(result, selectedSheet, t, formatList);

  const handleScroll = () => {
    const gridWrap = gridWrapRef.current;
    if (!gridWrap) return;
    setViewport({
      scrollTop: gridWrap.scrollTop,
      height: gridWrap.clientHeight,
    });
  };

  return (
    <div className="office-spreadsheet-preview">
      <div
        className="office-spreadsheet-grid-wrap"
        data-po-scrollbar="content"
        ref={gridWrapRef}
        onScroll={handleScroll}
      >
        <table className="office-spreadsheet-grid">
          <colgroup>
            <col className="office-spreadsheet-grid__row-header-col" />
            {selectedSheet.columns.map((column) => (
              <col key={column.columnIndex} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="office-spreadsheet-grid__corner" aria-hidden="true" />
              {selectedSheet.columns.map((column) => (
                <th
                  className="office-spreadsheet-grid__column-header"
                  key={column.columnIndex}
                  scope="col"
                >
                  {spreadsheetColumnLabel(column.columnIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr className="office-spreadsheet-grid__spacer" aria-hidden="true">
                <td colSpan={columnSpan} style={{ height: topSpacerHeight }} />
              </tr>
            )}
            {renderedRows.map((row) => (
              <tr key={row.rowIndex}>
                <th className="office-spreadsheet-grid__row-header" scope="row">
                  {formatNumber(row.rowIndex + 1)}
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={`${row.rowIndex}-${cell.columnIndex}`}
                    colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                  >
                    <span dir="auto">{cell.value}</span>
                  </td>
                ))}
              </tr>
            ))}
            {bottomSpacerHeight > 0 && (
              <tr className="office-spreadsheet-grid__spacer" aria-hidden="true">
                <td colSpan={columnSpan} style={{ height: bottomSpacerHeight }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {previewNotes.length > 0 && (
        <div className="office-preview__note">
          {previewNotes.join(" ")}
        </div>
      )}
      <div
        className="office-spreadsheet-tabs"
        data-po-scrollbar="horizontal"
        role="tablist"
        aria-label={t("editor.office.sheets")}
      >
        {result.sheets.map((sheet, index) => (
          <button
            key={sheet.name}
            type="button"
            role="tab"
            aria-selected={index === activeSheet}
            onClick={() => onActiveSheetChange(index)}
          >
            <span dir="auto">{sheet.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function spreadsheetColumnLabel(columnIndex: number): string {
  let value = Math.max(0, columnIndex) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function createSpreadsheetPreviewNotes(
  result: SpreadsheetPreviewResult,
  sheet: SpreadsheetSheet,
  t: MessageFormatter,
  formatList: ReturnType<typeof useLocalization>["formatList"],
): string[] {
  const notes: string[] = [];
  if (result.budget.truncated) {
    const reasons = result.budget.truncationReasons.map((reason) => t(
      reason === "materialized-cell-limit"
        ? "editor.office.budget.cellCount"
        : "editor.office.budget.textMemory",
    ));
    notes.push(t("editor.office.budgetStopped", { reasons: formatList(reasons) }));
  }
  if (result.truncatedSheetCount > 0) {
    notes.push(t("editor.office.visibleSheets", {
      visible: result.sheets.length,
      total: result.totalVisibleSheets,
    }));
  }
  if (result.hiddenSheetCount > 0) {
    notes.push(t("editor.office.hiddenSheetsOmitted", { count: result.hiddenSheetCount }));
  }
  if (sheet.truncatedRows) {
    notes.push(t("editor.office.visibleRows", { visible: sheet.rows.length, total: sheet.totalVisibleRows }));
  }
  if (sheet.truncatedColumns) {
    notes.push(t("editor.office.visibleColumns", {
      visible: sheet.columns.length,
      total: sheet.totalVisibleColumns,
    }));
  }
  if (sheet.hiddenRowCount > 0) {
    notes.push(t("editor.office.hiddenRowsOmitted", { count: sheet.hiddenRowCount }));
  }
  if (sheet.hiddenColumnCount > 0) {
    notes.push(t("editor.office.hiddenColumnsOmitted", { count: sheet.hiddenColumnCount }));
  }
  return notes;
}

function DocxDocumentPreview({
  arrayBuffer,
  documentPath,
  openExternalFile,
  openExternalUrl,
}: {
  arrayBuffer: ArrayBuffer;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
  openExternalUrl?: (href: string) => void | Promise<void>;
}) {
  const { t } = useLocalization();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [renderState, setRenderState] = useState<{ status: "loading" | "ready" | "error"; message?: string }>({
    status: "loading",
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadowRoot.replaceChildren();

    const fragment = document.createDocumentFragment();
    const baseStyle = document.createElement("style");
    baseStyle.textContent = DOCX_SHADOW_BASE_CSS;
    const styleContainer = document.createElement("div");
    styleContainer.className = "office-docx-style-container";
    const bodyContainer = document.createElement("div");
    bodyContainer.className = "office-docx-body";
    fragment.append(baseStyle, styleContainer, bodyContainer);
    setRenderState({ status: "loading" });

    const activateControlledLink = (event: Event) => {
      const link = findDocxLinkInEvent(event);
      if (!link) return;

      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();

      const internalHref = link.getAttribute("href");
      if (internalHref?.startsWith("#")) {
        findDocxFragmentTarget(shadowRoot, internalHref)?.scrollIntoView({ block: "start" });
        return;
      }

      const externalHref = getControlledDocxExternalHref(link);
      if (externalHref && openExternalUrl) {
        void Promise.resolve().then(() => openExternalUrl(externalHref)).catch((error) => {
          setRenderState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    };
    shadowRoot.addEventListener("click", activateControlledLink);
    shadowRoot.addEventListener("keydown", activateControlledLink);

    import("docx-preview")
      .then(({ renderAsync }) => renderAsync(
        arrayBuffer.slice(0),
        bodyContainer,
        styleContainer,
        {
          renderAltChunks: false,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          renderChanges: false,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          useBase64URL: true,
          inWrapper: true,
          className: "office-docx",
        },
      ))
      .then(() => {
        if (cancelled) return;
        assertDocxDomWithinBudget(fragment);
        sanitizeDocxDom(fragment);
        shadowRoot.replaceChildren(fragment);
        fitDocxPreviewToWidth(host, bodyContainer);
        resizeObserver = new ResizeObserver(() => fitDocxPreviewToWidth(host, bodyContainer));
        resizeObserver.observe(host);
        setRenderState({ status: "ready" });
      })
      .catch((error) => {
        if (!cancelled) {
          setRenderState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      shadowRoot.removeEventListener("click", activateControlledLink);
      shadowRoot.removeEventListener("keydown", activateControlledLink);
      shadowRoot.replaceChildren();
    };
  }, [arrayBuffer, openExternalUrl]);

  if (renderState.status === "error") {
    return (
      <OfficeEmptyState
        title={t("editor.preview.failed")}
        message={t("editor.office.docxFailed", {
          detail: bidiIsolate(renderState.message ?? t("editor.office.unknownError")),
        })}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <div
      className="office-document-preview office-document-preview--docx"
      data-po-scrollbar="content"
    >
      {renderState.status === "loading" && (
        <div className="office-docx-render-state">{t("editor.office.renderingWord")}</div>
      )}
      <div
        ref={hostRef}
        className="office-docx-host"
        data-rendering={renderState.status === "loading" ? "true" : undefined}
      />
    </div>
  );
}

function OfficeEmptyState({
  title,
  message,
  documentPath,
  openExternalFile,
}: {
  title: string;
  message: string;
  documentPath?: string;
  openExternalFile?: (path: string) => Promise<void>;
}) {
  const { t } = useLocalization();
  const [externalOpenError, setExternalOpenError] = useState<string | null>(null);
  const openExternally = () => {
    if (!documentPath || !openExternalFile) return;
    setExternalOpenError(null);
    void Promise.resolve().then(() => openExternalFile(documentPath)).catch((error) => {
      setExternalOpenError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <div className="office-preview-empty">
      <strong>{title}</strong>
      <span dir="auto">{message}</span>
      {documentPath && openExternalFile && (
        <button type="button" onClick={openExternally}>
          {t("editor.openDefaultApp")}
        </button>
      )}
      {externalOpenError && (
        <span role="alert">
          {t("editor.office.openDesktopFailed", { detail: bidiIsolate(externalOpenError) })}
        </span>
      )}
    </div>
  );
}

async function loadOfficePreview({
  fileUrl,
  filename,
  extension,
  path,
  convertOfficeDocumentToDocx,
  signal,
}: {
  fileUrl?: string | null;
  filename: string;
  extension: string;
  path: string;
  convertOfficeDocumentToDocx?: OfficeViewerProps["convertOfficeDocumentToDocx"];
  signal?: AbortSignal;
}): Promise<OfficePreviewResult> {
  if (NATIVE_DOCX_CONVERTIBLE_EXTENSIONS.has(extension)) {
    if (!convertOfficeDocumentToDocx) {
      return unsupportedNativeConversionMessage(extension);
    }

    let convertedBuffer: ArrayBuffer;
    try {
      const result = await convertOfficeDocumentToDocx(path, { signal });
      signal?.throwIfAborted();
      convertedBuffer = result.arrayBuffer;
    } catch (error) {
      if (isAbortError(error)) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      return {
        kind: "unsupported",
        code: "conversion-failed",
        extension,
        detail: reason,
      };
    }

    const packageRejection = getOfficePackageRejection("docx", convertedBuffer);
    if (packageRejection) return packageRejection;
    try {
      const validatedBuffer = await validateOfficePackageForPreview(
        convertedBuffer,
        "docx",
        DOCX_DECOMPRESSION_BUDGET,
        signal,
      );
      return { kind: "word", arrayBuffer: validatedBuffer };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return unsafeOfficePackageMessage("converted-word", error);
    }
  }

  if (LEGACY_PRESENTATION_EXTENSIONS.has(extension)) {
    return {
      kind: "unsupported",
      code: "legacy-presentation",
    };
  }

  if (!fileUrl) {
    return {
      kind: "unsupported",
      code: "resource-unavailable",
    };
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await fetchOfficeArrayBuffer(fileUrl, { signal });
  } catch (error) {
    if (error instanceof OfficeResourceLimitError) {
      return {
        kind: "unsupported",
        code: "resource-rejected",
        detail: error.message,
      };
    }
    throw error;
  }

  const packageRejection = getOfficePackageRejection(extension, arrayBuffer);
  if (packageRejection) return packageRejection;

  if (isWordExtension(extension)) {
    try {
      arrayBuffer = await validateOfficePackageForPreview(
        arrayBuffer,
        "docx",
        DOCX_DECOMPRESSION_BUDGET,
        signal,
      );
      return { kind: "word", arrayBuffer };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return unsafeOfficePackageMessage("word", error);
    }
  }
  if (isSpreadsheetExtension(extension)) {
    try {
      return await parseSpreadsheetInWorker(arrayBuffer, {
        archiveKind: getSpreadsheetArchiveKind(extension),
        signal,
      });
    } catch (error) {
      if (isZipPreflightError(error)) {
        return {
          kind: "unsupported",
          code: "unsafe-package",
          subject: "spreadsheet",
          detail: error.message,
        };
      }
      throw error;
    }
  }
  if (isPresentationExtension(extension)) {
    try {
      arrayBuffer = await validateOfficePackageForPreview(
        arrayBuffer,
        "ooxml",
        PRESENTATION_DECOMPRESSION_BUDGET,
        signal,
      );
      return { kind: "presentation", arrayBuffer };
    } catch (error) {
      if (isAbortError(error)) throw error;
      return unsafeOfficePackageMessage("presentation", error);
    }
  }
  if (isOpenDocumentExtension(extension)) {
    try {
      arrayBuffer = await validateOfficePackageForPreview(
        arrayBuffer,
        "zip",
        OPEN_DOCUMENT_DECOMPRESSION_BUDGET,
        signal,
      );
      return await parseOpenDocument(arrayBuffer, filename, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      return unsafeOfficePackageMessage("opendocument", error);
    }
  }

  return {
    kind: "unsupported",
    code: "unsupported-format",
  };
}

async function validateOfficePackageForPreview(
  arrayBuffer: ArrayBuffer,
  profile: "zip" | "ooxml" | "docx",
  budget: {
    maxEntryUncompressedBytes: number;
    maxTotalUncompressedBytes: number;
    maxDocxXmlStartTags?: number;
  },
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const result = await validateOfficePackageInWorker(arrayBuffer, {
    profile,
    budget,
    signal,
  });
  return result.arrayBuffer;
}

function unsafeOfficePackageMessage(
  subject: OfficePackageSubject,
  error: unknown,
): Extract<OfficePreviewResult, { kind: "unsupported" }> {
  return {
    kind: "unsupported",
    code: "unsafe-package",
    subject,
    detail: error instanceof Error ? error.message : String(error),
  };
}

function formatOfficeUnsupported(result: OfficeUnsupportedResult, t: MessageFormatter): string {
  switch (result.code) {
    case "conversion-failed":
      return t("editor.office.unsupported.conversionFailed", {
        extension: bidiIsolate(`.${result.extension ?? "doc"}`),
        detail: bidiIsolate(result.detail ?? t("editor.office.unknownError")),
      });
    case "legacy-presentation":
      return t("editor.office.unsupported.legacyPresentation");
    case "resource-unavailable":
      return t("editor.office.resourceUnavailable");
    case "resource-rejected":
      return t("editor.office.unsupported.resourceRejected", {
        detail: bidiIsolate(result.detail ?? t("editor.office.unknownError")),
      });
    case "unsafe-package":
      return t("editor.office.unsupported.unsafePackage", {
        subject: t(`editor.office.subject.${result.subject ?? "office"}`),
        detail: bidiIsolate(result.detail ?? t("editor.office.unknownError")),
      });
    case "legacy-word":
      return t("editor.office.unsupported.legacyWord");
    case "rich-text-converter":
      return t("editor.office.unsupported.richTextConverter");
    case "unsupported-format":
    default:
      return t("editor.office.unsupported.format");
  }
}

async function parsePresentationText(
  arrayBuffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<OfficePreviewResult> {
  const result = await extractOfficeTextFallbackInWorker(arrayBuffer, {
    operation: "extract-presentation-text",
    signal,
  });
  return {
    kind: "presentationText",
    slides: result.slides,
    truncatedSlideCount: result.report.truncatedSlideCount,
  };
}

async function parseOpenDocument(
  arrayBuffer: ArrayBuffer,
  filename: string,
  signal?: AbortSignal,
): Promise<OfficePreviewResult> {
  const result = await extractOfficeTextFallbackInWorker(arrayBuffer, {
    operation: "extract-opendocument-text",
    signal,
  });
  return {
    kind: "opendocument",
    title: filename,
    lines: result.lines,
    truncatedLines: result.report.truncatedLines,
  };
}

function getExtension(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename.toLowerCase());
  return match ? match[1] : "";
}

function getOfficePreviewSurfaceKind(
  extension: string,
): "word" | "spreadsheet" | "presentation" | "document" {
  if (["ppt", "pps", "pptx", "ppsx", "odp", "otp"].includes(extension)) {
    return "presentation";
  }
  if (isSpreadsheetExtension(extension)) return "spreadsheet";
  if (["doc", "docx", "rtf", "odt", "ott"].includes(extension)) return "word";
  return "document";
}

function isWordExtension(extension: string): boolean {
  return extension === "docx";
}

function isSpreadsheetExtension(extension: string): boolean {
  return extension === "xlsx"
    || extension === "xls"
    || extension === "xlsm"
    || extension === "xlsb"
    || extension === "ods"
    || extension === "ots";
}

function isPresentationExtension(extension: string): boolean {
  return extension === "pptx" || extension === "ppsx";
}

function isOpenDocumentExtension(extension: string): boolean {
  return extension === "odt" || extension === "ods" || extension === "odp" || extension === "ott" || extension === "ots" || extension === "otp";
}

function unsupportedNativeConversionMessage(extension: string): OfficePreviewResult {
  if (LEGACY_WORD_EXTENSIONS.has(extension)) {
    return {
      kind: "unsupported",
      code: "legacy-word",
    };
  }

  return {
    kind: "unsupported",
    code: "rich-text-converter",
  };
}

function fitDocxPreviewToWidth(host: HTMLElement, bodyContainer: HTMLElement) {
  const wrapper = bodyContainer.querySelector<HTMLElement>(".docx-wrapper") ?? bodyContainer;
  const firstPage = bodyContainer.querySelector<HTMLElement>(".office-docx");
  if (!firstPage) return;

  wrapper.style.zoom = "1";
  const availableWidth = Math.max(320, host.clientWidth - 28);
  const pageWidth = firstPage.getBoundingClientRect().width;
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return;

  const scale = Math.min(1, Math.max(0.35, availableWidth / pageWidth));
  wrapper.style.zoom = String(scale);
}

function getOfficePackageRejection(
  extension: string,
  arrayBuffer: ArrayBuffer,
): Extract<OfficePreviewResult, { kind: "unsupported" }> | null {
  try {
    if (OOXML_PACKAGE_EXTENSIONS.has(extension)) {
      preflightOoxmlPackage(arrayBuffer);
    } else if (OPEN_DOCUMENT_PACKAGE_EXTENSIONS.has(extension)) {
      preflightZipCentralDirectory(arrayBuffer);
    }
    return null;
  } catch (error) {
    if (!(error instanceof ZipPreflightError)) throw error;
    return {
      kind: "unsupported",
      code: "unsafe-package",
      subject: "office",
      detail: error.message,
    };
  }
}

function findDocxLinkInEvent(event: Event): Element | null {
  for (const target of event.composedPath()) {
    if (!(target instanceof Element)) continue;
    if (
      target.hasAttribute(CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE)
      || target.getAttribute("href")?.startsWith("#")
    ) {
      return target;
    }
  }
  return null;
}

function findDocxFragmentTarget(shadowRoot: ShadowRoot, href: string): Element | null {
  let fragmentId = href.slice(1);
  try {
    fragmentId = decodeURIComponent(fragmentId);
  } catch {
    return null;
  }
  return fragmentId ? shadowRoot.getElementById(fragmentId) : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function isZipPreflightError(error: unknown): error is Error {
  return error instanceof ZipPreflightError
    || (error instanceof Error && error.name === "ZipPreflightError");
}

const DOCX_SHADOW_BASE_CSS = `
  :host {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .office-docx-style-container {
    display: contents;
  }

  .office-docx-body {
    display: flex;
    justify-content: center;
    width: 100%;
    min-width: 0;
  }

  .office-docx-body .docx-wrapper {
    box-sizing: border-box;
    display: block;
    width: max-content;
    max-width: none;
    min-width: 0;
    padding: 0 !important;
    background: transparent !important;
    transform-origin: top center;
  }

  .office-docx-body .office-docx {
    margin: 0 auto 20px !important;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 2px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 12px 32px rgba(0, 0, 0, 0.13);
  }

  [${CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE}] {
    cursor: var(--po-clickable-cursor, pointer);
    text-decoration: underline;
  }

  [${CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE}]:focus-visible {
    border-radius: 2px;
    outline: 2px solid #5b8def;
    outline-offset: 2px;
  }
`;

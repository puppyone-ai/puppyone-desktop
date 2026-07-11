"use client";

import { useEffect, useRef, useState } from "react";
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
  | { kind: "unsupported"; message: string };

type PresentationSlide = {
  index: number;
  title: string;
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
}: OfficeViewerProps) {
  const [state, setState] = useState<OfficeState>({ status: "idle" });
  const [activeSheet, setActiveSheet] = useState(0);
  const extension = resolvedExtension ?? getExtension(document.name);
  const canUseNativeDocxConversion = Boolean(
    convertOfficeDocumentToDocx && NATIVE_DOCX_CONVERTIBLE_EXTENSIONS.has(extension),
  );
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

  if (fileUrlError && !canUseNativeDocxConversion) {
    return (
      <OfficeEmptyState
        title="Failed to load file"
        message={fileUrlError}
        documentPath={document.path}
        openExternalFile={openExternalFile}
      />
    );
  }

  if ((previewResourceLoading || state.status === "loading") && !previewResourceUrl && !canUseNativeDocxConversion) {
    return <div className="editor-state">Loading preview...</div>;
  }

  if (!previewResourceUrl && !canUseNativeDocxConversion && state.status !== "ready") {
    return (
      <OfficeEmptyState
        title="Preview not available"
        message="No preview resource is available for this file."
        documentPath={document.path}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <div className="office-preview">
      <div className="office-preview__body">
        {state.status === "error" && (
          <OfficeEmptyState
            title="Preview failed"
            message={state.message}
            documentPath={document.path}
            openExternalFile={openExternalFile}
          />
        )}
        {state.status === "idle" || state.status === "loading" ? (
          <div className="editor-state">Loading preview...</div>
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
      </div>
    </div>
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
  if (result.kind === "unsupported") {
    return (
      <OfficeEmptyState
        title="Preview not available"
        message={result.message}
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
    <div className="office-document-preview">
      <article className="office-document-page">
        <h1>{result.title}</h1>
        {result.lines.length > 0 ? (
          result.lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
        ) : (
          <p>No readable text was found.</p>
        )}
        {result.truncatedLines && (
          <div className="office-preview__note">Showing the first 400 extracted text lines.</div>
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
  if (slides.length === 0) {
    return <OfficeEmptyState title="Empty presentation" message="No slide text was found in this presentation." />;
  }

  return (
    <div className="office-presentation-preview">
      {truncatedSlideCount > 0 && (
        <div className="office-preview__note">
          {truncatedSlideCount} additional slides were omitted by the text fallback safety budget.
        </div>
      )}
      {slides.map((slide) => (
        <article className="office-slide-card" key={slide.index}>
          <div className="office-slide-card__number">{slide.index}</div>
          <div className="office-slide-card__content">
            <h2>{slide.title}</h2>
            {slide.lines.length > 0 ? (
              <ul>
                {slide.lines.map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>No readable text on this slide.</p>
            )}
          </div>
        </article>
      ))}
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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [renderState, setRenderState] = useState<
    | { status: "loading" | "ready" }
    | { status: "fallback"; message: string; slides: PresentationSlide[] }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const abortController = new AbortController();
    let cancelled = false;
    let viewer: { destroy: () => void } | null = null;

    host.replaceChildren();
    setRenderState({ status: "loading" });

    import("@aiden0z/pptx-renderer")
      .then(({ PptxViewer, RECOMMENDED_ZIP_LIMITS }) => PptxViewer.open(arrayBuffer.slice(0), host, {
        fitMode: "contain",
        lazyMedia: true,
        lazySlides: true,
        pdfjs: false,
        renderMode: "list",
        signal: abortController.signal,
        zipLimits: RECOMMENDED_ZIP_LIMITS,
        listOptions: {
          windowed: true,
          initialSlides: 4,
          batchSize: 4,
        },
      }))
      .then((nextViewer) => {
        if (cancelled) {
          nextViewer.destroy();
          return;
        }
        viewer = nextViewer;
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
              message: `PuppyOne could not render the high-fidelity PPTX preview. Showing bounded extracted slide text instead.${fallback.truncatedSlideCount > 0 ? ` ${fallback.truncatedSlideCount} additional slides were omitted.` : ""} ${message}`,
              slides: fallback.slides,
            });
          }
        } catch (fallbackError) {
          if (!cancelled) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            setRenderState({
              status: "error",
              message: `PuppyOne could not render this PPTX preview. ${message} Text fallback also failed: ${fallbackMessage}`,
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

  if (renderState.status === "fallback") {
    return (
      <div className="office-pptx-render-preview">
        <div className="office-preview__note">{renderState.message}</div>
        <PresentationTextPreview slides={renderState.slides} />
      </div>
    );
  }

  if (renderState.status === "error") {
    return (
      <OfficeEmptyState
        title="Preview failed"
        message={renderState.message}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <div className="office-pptx-render-preview">
      <div
        ref={hostRef}
        className="office-pptx-render-host"
        data-rendering={renderState.status === "loading" ? "true" : undefined}
      />
      {renderState.status === "loading" && (
        <div className="office-pptx-render-state">Rendering presentation...</div>
      )}
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
      ? `${result.hiddenSheetCount} hidden ${pluralize("sheet", result.hiddenSheetCount)} omitted.`
      : "No sheets were found in this workbook.";
    return <OfficeEmptyState title="No visible sheets" message={hiddenMessage} />;
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
  const previewNotes = createSpreadsheetPreviewNotes(result, selectedSheet);

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
      <div className="office-spreadsheet-tabs" role="tablist" aria-label="Sheets">
        {result.sheets.map((sheet, index) => (
          <button
            key={sheet.name}
            type="button"
            role="tab"
            aria-selected={index === activeSheet}
            onClick={() => onActiveSheetChange(index)}
          >
            {sheet.name}
          </button>
        ))}
      </div>
      <div className="office-spreadsheet-grid-wrap" ref={gridWrapRef} onScroll={handleScroll}>
        <table className="office-spreadsheet-grid">
          <colgroup>
            <col className="office-spreadsheet-grid__row-header-col" />
            {selectedSheet.columns.map((column) => (
              <col key={column.columnIndex} style={{ width: column.width }} />
            ))}
          </colgroup>
          <tbody>
            {topSpacerHeight > 0 && (
              <tr className="office-spreadsheet-grid__spacer" aria-hidden="true">
                <td colSpan={columnSpan} style={{ height: topSpacerHeight }} />
              </tr>
            )}
            {renderedRows.map((row) => (
              <tr key={row.rowIndex}>
                <th scope="row">{row.rowIndex + 1}</th>
                {row.cells.map((cell) => (
                  <td
                    key={`${row.rowIndex}-${cell.columnIndex}`}
                    colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                  >
                    {cell.value}
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
    </div>
  );
}

function createSpreadsheetPreviewNotes(
  result: SpreadsheetPreviewResult,
  sheet: SpreadsheetSheet,
): string[] {
  const notes: string[] = [];
  if (result.budget.truncated) {
    const reasons = result.budget.truncationReasons.map((reason) => (
      reason === "materialized-cell-limit" ? "cell-count" : "text-memory"
    ));
    notes.push(`Preview stopped at the spreadsheet ${reasons.join(" and ")} safety budget.`);
  }
  if (result.truncatedSheetCount > 0) {
    notes.push(`Showing ${result.sheets.length} of ${result.totalVisibleSheets} visible sheets.`);
  }
  if (result.hiddenSheetCount > 0) {
    notes.push(`${result.hiddenSheetCount} hidden ${pluralize("sheet", result.hiddenSheetCount)} omitted.`);
  }
  if (sheet.truncatedRows) {
    notes.push(`Showing ${sheet.rows.length} of ${sheet.totalVisibleRows} visible rows.`);
  }
  if (sheet.truncatedColumns) {
    notes.push(`Showing ${sheet.columns.length} of ${sheet.totalVisibleColumns} visible columns.`);
  }
  if (sheet.hiddenRowCount > 0) {
    notes.push(`${sheet.hiddenRowCount} hidden ${pluralize("row", sheet.hiddenRowCount)} omitted.`);
  }
  if (sheet.hiddenColumnCount > 0) {
    notes.push(`${sheet.hiddenColumnCount} hidden ${pluralize("column", sheet.hiddenColumnCount)} omitted.`);
  }
  return notes;
}

function pluralize(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
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
            message: `The external link could not be opened. ${error instanceof Error ? error.message : String(error)}`,
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
        title="Preview failed"
        message={`PuppyOne could not render this DOCX preview. ${renderState.message ?? ""}`.trim()}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <div className="office-document-preview office-document-preview--docx">
      {renderState.status === "loading" && (
        <div className="office-docx-render-state">Rendering Word document...</div>
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
      <span>{message}</span>
      {documentPath && openExternalFile && (
        <button type="button" onClick={openExternally}>
          Open in default app
        </button>
      )}
      {externalOpenError && <span role="alert">Could not open the desktop app. {externalOpenError}</span>}
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
        message: `PuppyOne could not convert this .${extension} file for preview. Open it in a desktop app or re-save it as .docx. ${reason}`,
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
      return unsafeOfficePackageMessage("converted Word document", error);
    }
  }

  if (LEGACY_PRESENTATION_EXTENSIONS.has(extension)) {
    return {
      kind: "unsupported",
      message: "Legacy binary PowerPoint files do not have a built-in preview. Open this file in a desktop app or re-save it as .pptx.",
    };
  }

  if (!fileUrl) {
    return {
      kind: "unsupported",
      message: "No file resource is available for the lightweight Office preview.",
    };
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await fetchOfficeArrayBuffer(fileUrl, { signal });
  } catch (error) {
    if (error instanceof OfficeResourceLimitError) {
      return {
        kind: "unsupported",
        message: error.message,
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
      return unsafeOfficePackageMessage("Word document", error);
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
          message: `This spreadsheet was rejected before preview because its package is unsafe or malformed. ${error.message}`,
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
      return unsafeOfficePackageMessage("OpenDocument file", error);
    }
  }

  return {
    kind: "unsupported",
    message: "This Office format is not available in the lightweight preview.",
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
  label: string,
  error: unknown,
): Extract<OfficePreviewResult, { kind: "unsupported" }> {
  return {
    kind: "unsupported",
    message: `This ${label} was rejected before preview because decompression exceeded a safety budget or the package was malformed. ${error instanceof Error ? error.message : String(error)}`,
  };
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
      message: "Legacy binary Word files do not have a built-in preview here. Open this file in a desktop app or re-save it as .docx.",
    };
  }

  return {
    kind: "unsupported",
    message: "Rich Text files need the desktop converter for lightweight preview. Open this file in a desktop app or re-save it as .docx.",
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
      message: `This Office file was rejected before preview because its package is unsafe or malformed. ${error.message}`,
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
    margin: 0 auto 18px !important;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
  }

  [${CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE}] {
    cursor: pointer;
    text-decoration: underline;
  }

  [${CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE}]:focus-visible {
    border-radius: 2px;
    outline: 2px solid #5b8def;
    outline-offset: 2px;
  }
`;

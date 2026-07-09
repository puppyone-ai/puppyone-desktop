"use client";

import { useEffect, useRef, useState } from "react";
import type { EditorViewerContext } from "../viewerTypes";

type OfficeState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: OfficePreviewResult };

type OfficePreviewResult =
  | { kind: "word"; arrayBuffer: ArrayBuffer }
  | { kind: "spreadsheet"; sheets: SpreadsheetSheet[] }
  | { kind: "presentation"; slides: PresentationSlide[] }
  | { kind: "opendocument"; title: string; lines: string[] }
  | { kind: "unsupported"; message: string };

type SpreadsheetSheet = {
  name: string;
  rows: string[][];
  totalRows: number;
  totalColumns: number;
};

type PresentationSlide = {
  index: number;
  title: string;
  lines: string[];
};

const MAX_SHEET_ROWS = 250;
const MAX_SHEET_COLUMNS = 36;
const MAX_ODF_LINES = 400;
const MAX_OFFICE_PREVIEW_BYTES = 25 * 1024 * 1024;
const LEGACY_WORD_EXTENSIONS = new Set(["doc"]);
const LEGACY_PRESENTATION_EXTENSIONS = new Set(["ppt", "pps"]);
const NATIVE_DOCX_CONVERTIBLE_EXTENSIONS = new Set(["doc", "rtf"]);

export function OfficeViewer({
  document,
  fileUrl,
  fileUrlLoading,
  fileUrlError,
  openExternalFile,
  convertOfficeDocumentToDocx,
}: EditorViewerContext) {
  const [state, setState] = useState<OfficeState>({ status: "idle" });
  const [activeSheet, setActiveSheet] = useState(0);
  const extension = getExtension(document.name);
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

    setState({ status: "loading" });
    loadOfficePreview({
      fileUrl: previewResourceUrl,
      filename: document.name,
      path: document.path,
      convertOfficeDocumentToDocx,
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
    };
  }, [canUseNativeDocxConversion, convertOfficeDocumentToDocx, document.name, document.path, previewResourceLoading, previewResourceUrl]);

  if (fileUrlError && !canUseNativeDocxConversion) {
    return <div className="editor-state danger">Failed to load file: {fileUrlError}</div>;
  }

  if ((previewResourceLoading || state.status === "loading") && !previewResourceUrl && !canUseNativeDocxConversion) {
    return <div className="editor-state">Loading preview...</div>;
  }

  if (!previewResourceUrl && !canUseNativeDocxConversion && state.status !== "ready") {
    return <div className="editor-state">No preview available for this file.</div>;
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
}: {
  documentPath: string;
  result: OfficePreviewResult;
  activeSheet: number;
  onActiveSheetChange: (index: number) => void;
  openExternalFile?: (path: string) => Promise<void>;
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
      />
    );
  }

  if (result.kind === "spreadsheet") {
    if (result.sheets.length === 0) {
      return <OfficeEmptyState title="Empty workbook" message="No sheets were found in this workbook." />;
    }

    const selectedSheet = result.sheets[Math.min(activeSheet, result.sheets.length - 1)];
    const hasTruncatedRows = selectedSheet.totalRows > selectedSheet.rows.length;
    const hasTruncatedColumns = selectedSheet.totalColumns > MAX_SHEET_COLUMNS;

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
        <div className="office-spreadsheet-grid-wrap">
          <table className="office-spreadsheet-grid">
            <tbody>
              {selectedSheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th scope="row">{rowIndex + 1}</th>
                  {row.map((cell, columnIndex) => (
                    <td key={`${rowIndex}-${columnIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(hasTruncatedRows || hasTruncatedColumns) && (
          <div className="office-preview__note">
            Showing {selectedSheet.rows.length} of {selectedSheet.totalRows} rows
            {hasTruncatedColumns ? ` and ${MAX_SHEET_COLUMNS} of ${selectedSheet.totalColumns} columns` : ""}.
          </div>
        )}
      </div>
    );
  }

  if (result.kind === "presentation") {
    if (result.slides.length === 0) {
      return <OfficeEmptyState title="Empty presentation" message="No slide text was found in this presentation." />;
    }

    return (
      <div className="office-presentation-preview">
        {result.slides.map((slide) => (
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

  return (
    <div className="office-document-preview">
      <article className="office-document-page">
        <h1>{result.title}</h1>
        {result.lines.length > 0 ? (
          result.lines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
        ) : (
          <p>No readable text was found.</p>
        )}
      </article>
    </div>
  );
}

function DocxDocumentPreview({
  arrayBuffer,
  documentPath,
  openExternalFile,
}: {
  arrayBuffer: ArrayBuffer;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
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

    const baseStyle = document.createElement("style");
    baseStyle.textContent = DOCX_SHADOW_BASE_CSS;
    const styleContainer = document.createElement("div");
    styleContainer.className = "office-docx-style-container";
    const bodyContainer = document.createElement("div");
    bodyContainer.className = "office-docx-body";
    shadowRoot.append(baseStyle, styleContainer, bodyContainer);
    setRenderState({ status: "loading" });

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
        removeExternalDocumentResources(bodyContainer);
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
      shadowRoot.replaceChildren();
    };
  }, [arrayBuffer]);

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
  return (
    <div className="office-preview-empty">
      <strong>{title}</strong>
      <span>{message}</span>
      {documentPath && openExternalFile && (
        <button type="button" onClick={() => void openExternalFile(documentPath)}>
          Open in default app
        </button>
      )}
    </div>
  );
}

async function loadOfficePreview({
  fileUrl,
  filename,
  path,
  convertOfficeDocumentToDocx,
}: {
  fileUrl?: string | null;
  filename: string;
  path: string;
  convertOfficeDocumentToDocx?: (path: string) => Promise<{ arrayBuffer: ArrayBuffer; warnings?: string[] }>;
}): Promise<OfficePreviewResult> {
  const extension = getExtension(filename);

  if (NATIVE_DOCX_CONVERTIBLE_EXTENSIONS.has(extension)) {
    if (!convertOfficeDocumentToDocx) {
      return unsupportedNativeConversionMessage(extension);
    }

    try {
      const result = await convertOfficeDocumentToDocx(path);
      return {
        kind: "word",
        arrayBuffer: result.arrayBuffer,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        kind: "unsupported",
        message: `PuppyOne could not convert this .${extension} file for preview. Open it in a desktop app or re-save it as .docx. ${reason}`,
      };
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
    arrayBuffer = await fetchArrayBuffer(fileUrl);
  } catch (error) {
    if (error instanceof OfficePreviewLimitError) {
      return {
        kind: "unsupported",
        message: error.message,
      };
    }
    throw error;
  }

  if (isWordExtension(extension)) {
    return {
      kind: "word",
      arrayBuffer,
    };
  }
  if (isSpreadsheetExtension(extension)) {
    try {
      return await parseSpreadsheet(arrayBuffer);
    } catch (error) {
      if (!isOpenDocumentExtension(extension)) throw error;
    }
  }
  if (isPresentationExtension(extension)) return parsePresentation(arrayBuffer);
  if (isOpenDocumentExtension(extension)) return parseOpenDocument(arrayBuffer, filename);

  return {
    kind: "unsupported",
    message: "This Office format is not available in the lightweight preview.",
  };
}

async function fetchArrayBuffer(fileUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_OFFICE_PREVIEW_BYTES) {
    throw new OfficePreviewLimitError(`This file is larger than the ${formatBytes(MAX_OFFICE_PREVIEW_BYTES)} Office preview limit. Open it in a desktop app for full fidelity.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_OFFICE_PREVIEW_BYTES) {
    throw new OfficePreviewLimitError(`This file is larger than the ${formatBytes(MAX_OFFICE_PREVIEW_BYTES)} Office preview limit. Open it in a desktop app for full fidelity.`);
  }
  return arrayBuffer;
}

async function parseSpreadsheet(arrayBuffer: ArrayBuffer): Promise<OfficePreviewResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,
    dense: false,
  });

  return {
    kind: "spreadsheet",
    sheets: workbook.SheetNames.slice(0, 12).map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const range = worksheet?.["!ref"] ? XLSX.utils.decode_range(worksheet["!ref"]) : null;
      const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date | null>>(worksheet, {
        header: 1,
        blankrows: false,
        defval: "",
        raw: false,
      });
      const visibleRows = rows.slice(0, MAX_SHEET_ROWS).map((row) => (
        row.slice(0, MAX_SHEET_COLUMNS).map(formatCellValue)
      ));
      const totalRows = range ? range.e.r - range.s.r + 1 : rows.length;
      const totalColumns = range ? range.e.c - range.s.c + 1 : Math.max(0, ...rows.map((row) => row.length));

      return {
        name: sheetName,
        rows: normalizeSpreadsheetRows(visibleRows),
        totalRows,
        totalColumns,
      };
    }),
  };
}

async function parsePresentation(arrayBuffer: ArrayBuffer): Promise<OfficePreviewResult> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideEntries = Object.values(zip.files)
    .filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file.name))
    .sort((left, right) => getSlideIndex(left.name) - getSlideIndex(right.name));

  const slides = await Promise.all(
    slideEntries.map(async (file, index) => {
      const xml = await file.async("text");
      const lines = extractXmlText(xml);
      const [title, ...body] = lines;

      return {
        index: index + 1,
        title: title || `Slide ${index + 1}`,
        lines: body,
      };
    }),
  );

  return { kind: "presentation", slides };
}

async function parseOpenDocument(arrayBuffer: ArrayBuffer, filename: string): Promise<OfficePreviewResult> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentFile = zip.file("content.xml");

  if (!contentFile) {
    return {
      kind: "unsupported",
      message: "This OpenDocument file does not contain readable content.xml.",
    };
  }

  const xml = await contentFile.async("text");
  const lines = extractXmlText(xml).slice(0, MAX_ODF_LINES);

  return {
    kind: "opendocument",
    title: filename,
    lines,
  };
}

function normalizeSpreadsheetRows(rows: string[][]): string[][] {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return rows.map((row) => {
    const nextRow = row.slice();
    while (nextRow.length < columnCount) nextRow.push("");
    return nextRow;
  });
}

function formatCellValue(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString();
  return String(value);
}

function extractXmlText(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) return [];

  const nodes = Array.from(doc.getElementsByTagName("*"));
  const paragraphNodes = nodes.filter((node) => node.localName === "p");
  const textNodes = paragraphNodes.length > 0
    ? paragraphNodes
    : nodes.filter((node) => node.localName === "t");
  const textLines = textNodes
    .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter(Boolean);

  return dedupeConsecutive(textLines);
}

function dedupeConsecutive(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result[result.length - 1] !== line) result.push(line);
  }
  return result;
}

function getSlideIndex(path: string): number {
  const match = /slide(\d+)\.xml$/i.exec(path);
  return match ? Number(match[1]) : 0;
}

function getExtension(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename.toLowerCase());
  return match ? match[1] : "";
}

function isWordExtension(extension: string): boolean {
  return extension === "docx";
}

function isSpreadsheetExtension(extension: string): boolean {
  return extension === "xlsx" || extension === "xls" || extension === "xlsm" || extension === "xlsb" || extension === "ods";
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

function removeExternalDocumentResources(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>("script, iframe, object, embed, link, meta, base, form, input, button, textarea, select").forEach((node) => {
    node.remove();
  });

  for (const element of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || name === "srcdoc" || name === "srcset") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === "src" || name === "poster") && value && !isSafeDocxResourceUrl(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function isSafeDocxResourceUrl(value: string): boolean {
  return /^(data:|blob:|about:blank$)/i.test(value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

class OfficePreviewLimitError extends Error {}

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
`;

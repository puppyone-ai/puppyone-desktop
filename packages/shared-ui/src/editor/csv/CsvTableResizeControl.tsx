"use client";

import type { MessageFormatter } from "@puppyone/localization/core";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { EDITABLE_TABLE_COLUMN_MIN_WIDTH } from "../table/editableTableLayout";
import { MAX_CSV_TABLE_COLUMNS, MAX_CSV_TABLE_DATA_ROWS } from "./csvTableOperations";

const RESIZE_DRAG_ACTIVATION_DISTANCE = 4;
const RESIZE_PICKER_ROWS = 6;
const RESIZE_PICKER_COLUMNS = 6;
const FALLBACK_ROW_HEIGHT = 31;

type CsvTableExpansion = Readonly<{
  addedRows: number;
  addedColumns: number;
}>;

type CsvTableResizePreview = CsvTableExpansion & Readonly<{
  rowHeight: number;
  columnWidth: number;
}>;

type DragSession = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  rowHeight: number;
  columnWidth: number;
  maximumAddedRows: number;
  maximumAddedColumns: number;
  pointerBounds: CsvTableResizePointerBounds | null;
  preview: CsvTableResizePreview;
};

type CsvTableResizeRect = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

type CsvTableResizePointerBounds = CsvTableResizeRect;

type CsvTableResizeControlProps = Readonly<{
  columnWidths: readonly number[];
  currentColumnCount: number;
  currentDataRowCount: number;
  direction: "ltr" | "rtl";
  onExpand: (targetDataRowCount: number, targetColumnCount: number) => void;
  t: MessageFormatter;
}>;

export function CsvTableResizeControl({
  columnWidths,
  currentColumnCount,
  currentDataRowCount,
  direction,
  onExpand,
  t,
}: CsvTableResizeControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerCellRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragSessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<CsvTableExpansion>({
    addedRows: 1,
    addedColumns: 1,
  });
  const [dragPreview, setDragPreview] = useState<CsvTableResizePreview | null>(null);
  const availableRows = Math.max(0, MAX_CSV_TABLE_DATA_ROWS - currentDataRowCount);
  const availableColumns = Math.max(0, MAX_CSV_TABLE_COLUMNS - currentColumnCount);
  const pickerRowCount = Math.min(RESIZE_PICKER_ROWS, availableRows);
  const pickerColumnCount = Math.min(RESIZE_PICKER_COLUMNS, availableColumns);
  const canExpand = availableRows > 0 || availableColumns > 0;
  const canOpenPicker = pickerRowCount > 0 && pickerColumnCount > 0;

  useEffect(() => {
    if (!pickerOpen) return;
    const picker = pickerRef.current;
    const button = buttonRef.current;
    if (!picker || !button) return;
    const document = picker.ownerDocument;
    const selectedCell = pickerCellRefs.current.get(expansionKey(pickerSelection));
    selectedCell?.focus({ preventScroll: true });

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (picker.contains(event.target) || button.contains(event.target)) return;
      setPickerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPickerOpen(false);
      button.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [pickerOpen, pickerSelection]);

  useEffect(() => {
    setPickerSelection((current) => ({
      addedRows: clampInteger(current.addedRows, 1, Math.max(1, pickerRowCount)),
      addedColumns: clampInteger(current.addedColumns, 1, Math.max(1, pickerColumnCount)),
    }));
    if (!canOpenPicker) setPickerOpen(false);
  }, [canOpenPicker, pickerColumnCount, pickerRowCount]);

  const commitExpansion = (expansion: CsvTableExpansion) => {
    const addedRows = clampInteger(expansion.addedRows, 0, availableRows);
    const addedColumns = clampInteger(expansion.addedColumns, 0, availableColumns);
    if (addedRows === 0 && addedColumns === 0) return;
    setPickerOpen(false);
    onExpand(currentDataRowCount + addedRows, currentColumnCount + addedColumns);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canExpand || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    setPickerOpen(false);

    const surface = event.currentTarget.closest<HTMLElement>(".csv-table-editor__surface");
    const referenceRow = surface?.querySelector<HTMLTableRowElement>("tbody tr:last-child, thead tr:last-child");
    const measuredRowHeight = referenceRow?.getBoundingClientRect().height ?? 0;
    const rowHeight = measuredRowHeight > 0 ? measuredRowHeight : FALLBACK_ROW_HEIGHT;
    const scrollContainer = surface?.closest<HTMLElement>(".csv-table-editor__scroll");
    const viewportConstraints = getCsvTableResizeViewportConstraints({
      columnWidth: EDITABLE_TABLE_COLUMN_MIN_WIDTH,
      direction,
      editorRect: scrollContainer ? getElementClientViewportRect(scrollContainer) : null,
      maximumAddedColumns: availableColumns,
      maximumAddedRows: availableRows,
      rowHeight,
      surfaceRect: surface?.getBoundingClientRect() ?? null,
    });
    const preview: CsvTableResizePreview = {
      addedRows: 0,
      addedColumns: 0,
      rowHeight,
      columnWidth: EDITABLE_TABLE_COLUMN_MIN_WIDTH,
    };
    dragSessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      rowHeight,
      columnWidth: EDITABLE_TABLE_COLUMN_MIN_WIDTH,
      maximumAddedRows: viewportConstraints.maximumAddedRows,
      maximumAddedColumns: viewportConstraints.maximumAddedColumns,
      pointerBounds: viewportConstraints.pointerBounds,
      preview,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Embedded runtimes may not expose pointer capture; the interaction then stays local.
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const currentX = session.pointerBounds
      ? clampNumber(event.clientX, session.pointerBounds.left, session.pointerBounds.right)
      : event.clientX;
    const currentY = session.pointerBounds
      ? clampNumber(event.clientY, session.pointerBounds.top, session.pointerBounds.bottom)
      : event.clientY;
    const horizontalDistance = direction === "rtl"
      ? session.startX - currentX
      : currentX - session.startX;
    const verticalDistance = currentY - session.startY;
    const movement = Math.hypot(currentX - session.startX, verticalDistance);
    if (!session.moved && movement < RESIZE_DRAG_ACTIVATION_DISTANCE) return;

    session.moved = true;
    session.preview = {
      ...getCsvTableExpansionFromDrag({
        horizontalDistance,
        verticalDistance,
        rowHeight: session.rowHeight,
        columnWidth: session.columnWidth,
        maximumAddedRows: session.maximumAddedRows,
        maximumAddedColumns: session.maximumAddedColumns,
      }),
      rowHeight: session.rowHeight,
      columnWidth: session.columnWidth,
    };
    setDragPreview(session.preview);
    event.preventDefault();
    event.stopPropagation();
  };

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSessionRef.current = null;
    setDragPreview(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Some test and embedded runtimes do not expose pointer capture.
    }
    if (!session.moved) return;
    suppressClickRef.current = !cancelled;
    if (!cancelled) commitExpansion(session.preview);
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!canOpenPicker) return;
    setPickerOpen((current) => !current);
  };

  const movePickerSelection = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ) => {
    let nextRow = row;
    let nextColumn = column;
    if (event.key === "ArrowUp") nextRow -= 1;
    else if (event.key === "ArrowDown") nextRow += 1;
    else if (event.key === "ArrowLeft") nextColumn += direction === "rtl" ? 1 : -1;
    else if (event.key === "ArrowRight") nextColumn += direction === "rtl" ? -1 : 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitExpansion({ addedRows: row, addedColumns: column });
      return;
    } else {
      return;
    }
    event.preventDefault();
    const next = {
      addedRows: clampInteger(nextRow, 1, pickerRowCount),
      addedColumns: clampInteger(nextColumn, 1, pickerColumnCount),
    };
    setPickerSelection(next);
    pickerCellRefs.current.get(expansionKey(next))?.focus({ preventScroll: true });
  };

  const pickerRows = useMemo(
    () => Array.from({ length: pickerRowCount }, (_, index) => index + 1),
    [pickerRowCount],
  );
  const pickerColumns = useMemo(
    () => Array.from({ length: pickerColumnCount }, (_, index) => index + 1),
    [pickerColumnCount],
  );
  const previewGeometry = dragPreview ? getCsvTableResizePreviewGeometry({
    addedColumns: dragPreview.addedColumns,
    addedRows: dragPreview.addedRows,
    columnWidth: dragPreview.columnWidth,
    currentColumnCount,
    currentColumnWidths: columnWidths,
    rowHeight: dragPreview.rowHeight,
  }) : null;
  const previewStyle = previewGeometry ? ({
    "--csv-table-resize-added-width": `${previewGeometry.addedInlineSize}px`,
    "--csv-table-resize-added-height": `${previewGeometry.addedBlockSize}px`,
    "--csv-table-resize-row-height": `${previewGeometry.rowHeight}px`,
  } as CSSProperties) : undefined;
  const previewColumnStyle = previewGeometry && dragPreview?.addedColumns ? ({
    gridTemplateColumns: `repeat(${dragPreview.addedColumns}, ${previewGeometry.addedColumnWidth}px)`,
  } as CSSProperties) : undefined;
  const previewRowStyle = previewGeometry && dragPreview?.addedRows ? ({
    gridTemplateColumns: [
      "var(--csv-table-record-index-width)",
      ...previewGeometry.dataColumnWidths.map((width) => `${width}px`),
    ].join(" "),
  } as CSSProperties) : undefined;
  const pickerRowStyle = ({
    gridTemplateColumns: `repeat(${pickerColumnCount}, 16px)`,
  } as CSSProperties);
  const previewDimensions = dragPreview ? {
    rows: currentDataRowCount + dragPreview.addedRows,
    columns: currentColumnCount + dragPreview.addedColumns,
  } : null;
  const pickerDimensions = {
    rows: currentDataRowCount + pickerSelection.addedRows,
    columns: currentColumnCount + pickerSelection.addedColumns,
  };

  return (
    <>
      <div
        className={`csv-table-editor__resize-control${dragPreview ? " is-resizing" : ""}`}
        dir={direction}
      >
        <button
          ref={buttonRef}
          type="button"
          className="csv-table-editor__resize-handle"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-label={t("editor.csv.expandTable")}
          disabled={!canExpand}
          title={t("editor.csv.expandTableHint")}
          onClick={handleClick}
          onPointerCancel={(event) => finishPointerInteraction(event, true)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPointerInteraction(event, false)}
        >
          <span
            className="csv-table-editor__resize-handle-visual po-editable-table-structure-button-visual"
            aria-hidden="true"
          />
        </button>

        {pickerOpen && (
          <div
            ref={pickerRef}
            className="desktop-menu-surface csv-table-editor__resize-picker"
            role="dialog"
            aria-label={t("editor.csv.expandTable")}
          >
            <div className="csv-table-editor__resize-picker-summary" aria-live="polite">
              <strong>{t("editor.csv.dimensions", pickerDimensions)}</strong>
              <span>{formatExpansionDelta(pickerSelection)}</span>
            </div>
            <div
              className="csv-table-editor__resize-picker-grid"
              role="grid"
              aria-label={t("editor.csv.expandTable")}
              aria-colcount={pickerColumnCount}
              aria-rowcount={pickerRowCount}
            >
              {pickerRows.map((row) => (
                <div
                  role="row"
                  className="csv-table-editor__resize-picker-row"
                  key={`row-${row}`}
                  style={pickerRowStyle}
                >
                  {pickerColumns.map((column) => {
                    const selected = row <= pickerSelection.addedRows && column <= pickerSelection.addedColumns;
                    const expansion = { addedRows: row, addedColumns: column };
                    return (
                      <button
                        key={`${row}-${column}`}
                        ref={(element) => {
                          const key = expansionKey(expansion);
                          if (element) pickerCellRefs.current.set(key, element);
                          else pickerCellRefs.current.delete(key);
                        }}
                        type="button"
                        role="gridcell"
                        tabIndex={row === pickerSelection.addedRows && column === pickerSelection.addedColumns ? 0 : -1}
                        className={`csv-table-editor__resize-picker-cell${selected ? " is-selected" : ""}`}
                        data-added-rows={row}
                        data-added-columns={column}
                        aria-label={t("editor.csv.expandTo", {
                          rows: currentDataRowCount + row,
                          columns: currentColumnCount + column,
                        })}
                        aria-selected={row === pickerSelection.addedRows && column === pickerSelection.addedColumns}
                        onClick={() => commitExpansion(expansion)}
                        onFocus={() => setPickerSelection(expansion)}
                        onKeyDown={(event) => movePickerSelection(event, row, column)}
                        onPointerEnter={() => setPickerSelection(expansion)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {dragPreview && (dragPreview.addedRows > 0 || dragPreview.addedColumns > 0) && (
        <div className="csv-table-editor__resize-preview" style={previewStyle} aria-hidden="true">
          {dragPreview.addedColumns > 0 && (
            <div className="csv-table-editor__resize-preview-columns" style={previewColumnStyle}>
              {Array.from({ length: dragPreview.addedColumns }, (_, columnIndex) => (
                <span
                  className="csv-table-editor__resize-preview-track csv-table-editor__resize-preview-track--data"
                  key={`added-column-${columnIndex}`}
                />
              ))}
            </div>
          )}
          {dragPreview.addedRows > 0 && previewGeometry && (
            <div className="csv-table-editor__resize-preview-rows" style={previewRowStyle}>
              <span className="csv-table-editor__resize-preview-track csv-table-editor__resize-preview-track--record-index">
                {Array.from({ length: dragPreview.addedRows }, (_, previewRowIndex) => (
                  <span
                    className="csv-table-editor__resize-preview-cell csv-table-editor__resize-preview-cell--record-index"
                    key={`preview-record-index-${previewRowIndex}`}
                  >
                    {currentDataRowCount + previewRowIndex + 1}
                  </span>
                ))}
              </span>
              {previewGeometry.dataColumnWidths.map((_, columnIndex) => (
                <span
                  className="csv-table-editor__resize-preview-track csv-table-editor__resize-preview-track--data"
                  key={`preview-column-${columnIndex}`}
                >
                  {Array.from({ length: dragPreview.addedRows }, (_, previewRowIndex) => (
                    <span
                      className="csv-table-editor__resize-preview-cell csv-table-editor__resize-preview-cell--data"
                      key={`preview-cell-${previewRowIndex}-${columnIndex}`}
                    />
                  ))}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {previewDimensions && (dragPreview?.addedRows || dragPreview?.addedColumns) ? (
        <div className="csv-table-editor__resize-status" role="status" aria-live="polite">
          <strong>{t("editor.csv.dimensions", previewDimensions)}</strong>
          <span>{formatExpansionDelta(dragPreview)}</span>
        </div>
      ) : null}
    </>
  );
}

export function getCsvTableExpansionFromDrag({
  horizontalDistance,
  verticalDistance,
  rowHeight,
  columnWidth,
  maximumAddedRows,
  maximumAddedColumns,
}: Readonly<{
  horizontalDistance: number;
  verticalDistance: number;
  rowHeight: number;
  columnWidth: number;
  maximumAddedRows: number;
  maximumAddedColumns: number;
}>): CsvTableExpansion {
  return {
    addedRows: clampInteger(
      Math.ceil(Math.max(0, verticalDistance) / Math.max(1, rowHeight)),
      0,
      maximumAddedRows,
    ),
    addedColumns: clampInteger(
      Math.ceil(Math.max(0, horizontalDistance) / Math.max(1, columnWidth)),
      0,
      maximumAddedColumns,
    ),
  };
}

/**
 * Freezes the visible CSV scroll viewport at drag start. A preview may consume
 * the remaining canvas after the current table, but it cannot extend outside
 * that viewport or produce a partially clipped row or column.
 */
export function getCsvTableResizeViewportConstraints({
  columnWidth,
  direction,
  editorRect,
  maximumAddedColumns,
  maximumAddedRows,
  rowHeight,
  surfaceRect,
}: Readonly<{
  columnWidth: number;
  direction: "ltr" | "rtl";
  editorRect: CsvTableResizeRect | null;
  maximumAddedColumns: number;
  maximumAddedRows: number;
  rowHeight: number;
  surfaceRect: CsvTableResizeRect | null;
}>) {
  const safeMaximumRows = clampInteger(maximumAddedRows, 0, MAX_CSV_TABLE_DATA_ROWS);
  const safeMaximumColumns = clampInteger(maximumAddedColumns, 0, MAX_CSV_TABLE_COLUMNS);
  if (!isUsableRect(editorRect) || !isUsableRect(surfaceRect)) {
    return {
      maximumAddedColumns: safeMaximumColumns,
      maximumAddedRows: safeMaximumRows,
      pointerBounds: null,
    } as const;
  }

  const normalizedRowHeight = normalizePositiveDimension(rowHeight, FALLBACK_ROW_HEIGHT);
  const normalizedColumnWidth = normalizePositiveDimension(
    columnWidth,
    EDITABLE_TABLE_COLUMN_MIN_WIDTH,
  );
  const availableBlockSize = Math.max(0, editorRect.bottom - surfaceRect.bottom);
  const availableInlineSize = Math.max(0, direction === "rtl"
    ? surfaceRect.left - editorRect.left
    : editorRect.right - surfaceRect.right);

  return {
    maximumAddedColumns: Math.min(
      safeMaximumColumns,
      Math.floor(availableInlineSize / normalizedColumnWidth),
    ),
    maximumAddedRows: Math.min(
      safeMaximumRows,
      Math.floor(availableBlockSize / normalizedRowHeight),
    ),
    pointerBounds: {
      bottom: editorRect.bottom,
      left: editorRect.left,
      right: editorRect.right,
      top: editorRect.top,
    },
  } as const;
}

/**
 * Builds preview tracks from the same widths as the semantic table. The record
 * index remains a separate CSS track and is intentionally absent from this
 * data-column list.
 */
export function getCsvTableResizePreviewGeometry({
  addedColumns,
  addedRows,
  columnWidth,
  currentColumnCount,
  currentColumnWidths,
  rowHeight,
}: Readonly<{
  addedColumns: number;
  addedRows: number;
  columnWidth: number;
  currentColumnCount: number;
  currentColumnWidths: readonly number[];
  rowHeight: number;
}>) {
  const normalizedCurrentColumnCount = clampInteger(
    currentColumnCount,
    1,
    MAX_CSV_TABLE_COLUMNS,
  );
  const normalizedAddedColumns = clampInteger(
    addedColumns,
    0,
    MAX_CSV_TABLE_COLUMNS - normalizedCurrentColumnCount,
  );
  const normalizedAddedRows = clampInteger(addedRows, 0, MAX_CSV_TABLE_DATA_ROWS);
  const normalizedColumnWidth = normalizePositiveDimension(
    columnWidth,
    EDITABLE_TABLE_COLUMN_MIN_WIDTH,
  );
  const normalizedRowHeight = normalizePositiveDimension(rowHeight, FALLBACK_ROW_HEIGHT);
  const currentWidths = Array.from({ length: normalizedCurrentColumnCount }, (_, columnIndex) => (
    normalizePositiveDimension(
      currentColumnWidths[columnIndex],
      EDITABLE_TABLE_COLUMN_MIN_WIDTH,
    )
  ));
  const addedWidths = Array.from(
    { length: normalizedAddedColumns },
    () => normalizedColumnWidth,
  );

  return {
    addedBlockSize: normalizedAddedRows * normalizedRowHeight,
    addedColumnWidth: normalizedColumnWidth,
    addedInlineSize: normalizedAddedColumns * normalizedColumnWidth,
    dataColumnWidths: [...currentWidths, ...addedWidths],
    rowHeight: normalizedRowHeight,
  } as const;
}

function expansionKey(expansion: CsvTableExpansion): string {
  return `${expansion.addedRows}:${expansion.addedColumns}`;
}

function formatExpansionDelta(expansion: CsvTableExpansion): string {
  return `+${expansion.addedRows} × +${expansion.addedColumns}`;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function normalizePositiveDimension(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function isUsableRect(rect: CsvTableResizeRect | null): rect is CsvTableResizeRect {
  return Boolean(
    rect
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.bottom)
    && rect.right > rect.left
    && rect.bottom > rect.top,
  );
}

function getElementClientViewportRect(element: HTMLElement): CsvTableResizeRect {
  const rect = element.getBoundingClientRect();
  if (element.clientWidth <= 0 || element.clientHeight <= 0) return rect;
  const left = rect.left + element.clientLeft;
  const top = rect.top + element.clientTop;
  return {
    bottom: top + element.clientHeight,
    left,
    right: left + element.clientWidth,
    top,
  };
}

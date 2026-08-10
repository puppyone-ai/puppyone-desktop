"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  ensureShape,
  inferDelimiter,
  inferHeaderRow,
  normalizeRows,
  parseDelimitedText,
  stringifyDelimitedText,
} from "./csv/csvDocument";
import { CsvViewSettings } from "./csv/CsvViewSettings";
import { CsvTableControls } from "./csv/CsvTableControls";
import {
  CsvTableResizeControl,
  type CsvTableExpansion,
} from "./csv/CsvTableResizeControl";
import {
  applyCsvTableOperation,
  MAX_CSV_TABLE_DATA_ROWS,
  type CsvTableFocusTarget,
  type CsvTableStructureOperation,
} from "./csv/csvTableOperations";
import {
  readCsvFirstRecordAsHeaderPreference,
  readCsvShowRowNumbersPreference,
  writeCsvFirstRecordAsHeaderPreference,
  writeCsvShowRowNumbersPreference,
} from "./csv/csvViewPreferences";
import {
  EDITABLE_TABLE_COLUMN_MIN_WIDTH,
  estimateEditableTableColumnWidths,
} from "./table/editableTableLayout";
import {
  getCsvFindMatchKey,
  useCsvFindAdapter,
} from "./find/useCsvFindAdapter";
import { useRegisterEditorFindAdapter } from "./find/editorFind";
import { useEditorChromeContributionPublisher } from "./editorChromeContribution";

export type CsvTableEditorProps = {
  documentId?: string;
  content: string;
  nodeName?: string;
  delimiter?: "," | "\t";
  readOnly?: boolean;
  onChange?: (content: string) => void;
};

export function CsvTableEditor({
  documentId,
  content,
  nodeName = "",
  delimiter,
  readOnly = true,
  onChange,
}: CsvTableEditorProps) {
  const { direction, locale, t } = useLocalization();
  const resolvedDelimiter = delimiter ?? inferDelimiter(nodeName, content);
  const parsed = useMemo(() => parseDelimitedText(content, resolvedDelimiter), [content, resolvedDelimiter]);
  const matrix = useMemo(() => normalizeRows(parsed.rows), [parsed.rows]);
  const inferredHeaderEnabled = useMemo(() => inferHeaderRow(parsed.rows), [parsed.rows]);
  const [headerEnabled, setHeaderEnabled] = useState(inferredHeaderEnabled);
  const [rowNumbersVisible, setRowNumbersVisible] = useState(true);
  const headerPreferenceDocumentRef = useRef(documentId);
  const headerPreferenceInitializedRef = useRef(false);
  const rowNumbersPreferenceDocumentRef = useRef(documentId);
  const rowNumbersPreferenceInitializedRef = useRef(false);
  const columnCount = Math.max(1, ...matrix.map((row) => row.length));
  const dataRows = headerEnabled ? matrix.slice(1) : matrix;
  const visibleDataRows = dataRows.slice(0, MAX_CSV_TABLE_DATA_ROWS);
  const hasCsvSource = content.length > 0;
  const dataRowCount = hasCsvSource ? dataRows.length : 0;
  const structuralDataRowCount = Math.max(0, matrix.length - (headerEnabled ? 1 : 0));
  const columnWidths = useMemo(
    () => estimateEditableTableColumnWidths(matrix, columnCount, (row) => row),
    [columnCount, matrix],
  );
  const [resizePreview, setResizePreview] = useState<CsvTableExpansion | null>(null);
  const previewAddedRows = resizePreview?.addedRows ?? 0;
  const previewAddedColumns = resizePreview?.addedColumns ?? 0;
  const previewColumnCount = columnCount + previewAddedColumns;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocusRef = useRef<CsvTableFocusTarget | null>(null);
  const searchableMatrix = useMemo(
    () => matrix.slice(0, MAX_CSV_TABLE_DATA_ROWS + (headerEnabled ? 1 : 0)),
    [headerEnabled, matrix],
  );
  const csvFind = useCsvFindAdapter(searchableMatrix, tableRef);

  useRegisterEditorFindAdapter(csvFind.adapter);
  const publishChromeContribution = useEditorChromeContributionPublisher();

  useLayoutEffect(() => {
    if (headerPreferenceDocumentRef.current !== documentId) {
      headerPreferenceDocumentRef.current = documentId;
      headerPreferenceInitializedRef.current = false;
    }
    if (headerPreferenceInitializedRef.current) return;

    const storedPreference = readCsvFirstRecordAsHeaderPreference(documentId);
    if (storedPreference !== undefined) {
      setHeaderEnabled(storedPreference);
      headerPreferenceInitializedRef.current = true;
      return;
    }

    setHeaderEnabled(inferredHeaderEnabled);
    if (hasCsvSource) {
      writeCsvFirstRecordAsHeaderPreference(documentId, inferredHeaderEnabled);
      headerPreferenceInitializedRef.current = true;
    }
  }, [documentId, hasCsvSource, inferredHeaderEnabled]);

  useLayoutEffect(() => {
    if (rowNumbersPreferenceDocumentRef.current !== documentId) {
      rowNumbersPreferenceDocumentRef.current = documentId;
      rowNumbersPreferenceInitializedRef.current = false;
    }
    if (rowNumbersPreferenceInitializedRef.current) return;

    const storedPreference = readCsvShowRowNumbersPreference(documentId);
    setRowNumbersVisible(storedPreference ?? true);
    if (storedPreference !== undefined || hasCsvSource) {
      rowNumbersPreferenceInitializedRef.current = true;
    }
  }, [documentId, hasCsvSource]);

  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    const input = tableRef.current?.querySelector<HTMLInputElement>(
      `input[data-csv-row="${target.rowIndex}"][data-csv-column="${target.columnIndex}"]`,
    );
    if (!input) return;
    pendingFocusRef.current = null;
    input.focus({ preventScroll: true });
    input.select();
  }, [matrix]);

  const emitMatrix = (nextMatrix: string[][]) => {
    // Table shape is structural state. Cell edits must not implicitly discard
    // trailing empty rows or columns; only explicit row/column operations may
    // shrink the matrix. Empty CSV fields and records keep that shape portable.
    onChange?.(stringifyDelimitedText(
      nextMatrix,
      resolvedDelimiter,
      parsed.layout,
      { preserveTerminalEmptyRecord: true },
    ));
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    const next = ensureShape(matrix, Math.max(matrix.length, rowIndex + 1), Math.max(columnCount, columnIndex + 1));
    next[rowIndex][columnIndex] = value;
    emitMatrix(next);
  };

  const addRow = () => {
    const next = ensureShape(matrix, matrix.length, columnCount);
    if (dataRowCount > 0 || headerEnabled) {
      next.push(Array.from({ length: columnCount }, () => ""));
    }
    pendingFocusRef.current = {
      rowIndex: headerEnabled ? Math.max(1, next.length - 1) : Math.max(0, next.length - 1),
      columnIndex: 0,
    };
    emitMatrix(next);
  };

  const addColumn = () => {
    const next = ensureShape(matrix, Math.max(matrix.length, headerEnabled ? 1 : 0), columnCount + 1);
    for (const row of next) row[columnCount] = row[columnCount] ?? "";
    pendingFocusRef.current = {
      rowIndex: headerEnabled && next.length > 1 ? 1 : 0,
      columnIndex: columnCount,
    };
    emitMatrix(next);
  };

  const applyStructureOperation = (operation: CsvTableStructureOperation) => {
    const result = applyCsvTableOperation(matrix, headerEnabled, operation);
    pendingFocusRef.current = result.focus;
    emitMatrix(result.rows);
  };

  const expandTable = (targetDataRowCount: number, targetColumnCount: number) => {
    applyStructureOperation({
      type: "expand-to-shape",
      rowIndex: headerEnabled ? Math.min(1, matrix.length - 1) : 0,
      columnIndex: Math.max(0, columnCount - 1),
      targetDataRowCount,
      targetColumnCount,
    });
  };

  const setFirstRecordAsHeader = useCallback((enabled: boolean) => {
    headerPreferenceInitializedRef.current = true;
    setHeaderEnabled(enabled);
    writeCsvFirstRecordAsHeaderPreference(documentId, enabled);
  }, [documentId]);

  const setShowRowNumbers = useCallback((visible: boolean) => {
    rowNumbersPreferenceInitializedRef.current = true;
    setRowNumbersVisible(visible);
    writeCsvShowRowNumbersPreference(documentId, visible);
  }, [documentId]);

  useLayoutEffect(() => {
    if (!publishChromeContribution || !documentId) return undefined;

    publishChromeContribution({
      kind: "csv-view-settings",
      documentId,
      headerEnabled,
      rowNumbersVisible,
      onHeaderChange: setFirstRecordAsHeader,
      onRowNumbersChange: setShowRowNumbers,
    });

    return () => publishChromeContribution(null);
  }, [
    documentId,
    headerEnabled,
    publishChromeContribution,
    rowNumbersVisible,
    setFirstRecordAsHeader,
    setShowRowNumbers,
  ]);

  const ariaColumnOffset = rowNumbersVisible ? 2 : 1;

  return (
    <section
      className="csv-table-editor"
      data-readonly={readOnly ? "true" : undefined}
      data-row-numbers-visible={rowNumbersVisible ? "true" : undefined}
    >
      <div
        className="csv-table-editor__scroll"
        data-po-scrollbar="content"
        onScroll={(event) => {
          const scrollContainer = event.currentTarget;
          const inlineScrolled = Math.abs(scrollContainer.scrollLeft) > 0.5;
          if (scrollContainer.hasAttribute("data-inline-scrolled") === inlineScrolled) return;
          scrollContainer.toggleAttribute("data-inline-scrolled", inlineScrolled);
        }}
      >
        {!publishChromeContribution && (
          <CsvViewSettings
            direction={direction}
            headerEnabled={headerEnabled}
            onHeaderChange={setFirstRecordAsHeader}
            onRowNumbersChange={setShowRowNumbers}
            rowNumbersVisible={rowNumbersVisible}
            t={t}
          />
        )}

        <div className="csv-table-editor__frame">
          <div
            ref={surfaceRef}
            className="csv-table-editor__surface po-editable-table-interaction-root"
            data-header-enabled={headerEnabled ? "true" : undefined}
            data-resize-preview={resizePreview ? "true" : undefined}
            dir={direction}
          >
            <table
              ref={tableRef}
              className="csv-table-editor__table"
              aria-label={nodeName || (resolvedDelimiter === "\t" ? "TSV" : "CSV")}
              aria-colcount={columnCount + (rowNumbersVisible ? 1 : 0)}
              aria-rowcount={matrix.length}
            >
              <colgroup>
                {rowNumbersVisible && <col className="csv-table-editor__record-index-column" />}
                {columnWidths.map((width, columnIndex) => (
                  <col key={`column-${columnIndex}`} style={{ width }} />
                ))}
                {Array.from({ length: previewAddedColumns }, (_, previewColumnIndex) => (
                  <col
                    className="csv-table-editor__expansion-column"
                    key={`expansion-column-${previewColumnIndex}`}
                    style={{ width: EDITABLE_TABLE_COLUMN_MIN_WIDTH }}
                  />
                ))}
              </colgroup>
              {headerEnabled && (
                <thead>
                  <tr data-csv-row="0" aria-rowindex={1}>
                    {rowNumbersVisible && (
                      <th
                        className="csv-table-editor__record-index csv-table-editor__record-index--header"
                        scope="row"
                        aria-colindex={1}
                        data-csv-record-index="0"
                        aria-label={t("editor.csv.headerRecord")}
                      />
                    )}
                    {Array.from({ length: columnCount }, (_, columnIndex) => (
                      <th
                        className="csv-table-editor__header-cell"
                        scope="col"
                        key={`header-${columnIndex}`}
                        data-csv-row="0"
                        data-csv-column={columnIndex}
                        data-find-match={csvFind.matchKeys.has(getCsvFindMatchKey({ rowIndex: 0, columnIndex })) ? "true" : undefined}
                        data-find-current={csvFind.currentMatch?.rowIndex === 0 && csvFind.currentMatch.columnIndex === columnIndex ? "true" : undefined}
                        aria-colindex={columnIndex + ariaColumnOffset}
                      >
                        <input
                          value={matrix[0]?.[columnIndex] ?? ""}
                          readOnly={readOnly}
                          onChange={(event) => updateCell(0, columnIndex, event.currentTarget.value)}
                          aria-label={t("editor.csv.columnHeader", { column: columnIndex + 1 })}
                          aria-haspopup="menu"
                          aria-expanded="false"
                          data-csv-row="0"
                          data-csv-column={columnIndex}
                          spellCheck={false}
                        />
                      </th>
                    ))}
                    {Array.from({ length: previewAddedColumns }, (_, previewColumnIndex) => (
                      <th
                        className="csv-table-editor__header-cell csv-table-editor__expansion-cell csv-table-editor__expansion-cell--column"
                        key={`expansion-header-${previewColumnIndex}`}
                        aria-hidden="true"
                      />
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {visibleDataRows.map((row, visibleRowIndex) => {
                  const rowIndex = headerEnabled ? visibleRowIndex + 1 : visibleRowIndex;
                  const displayRowNumber = visibleRowIndex + 1;
                  return (
                    <tr key={`row-${rowIndex}`} data-csv-row={rowIndex} aria-rowindex={rowIndex + 1}>
                      {rowNumbersVisible && (
                        <th
                          className="csv-table-editor__record-index"
                          scope="row"
                          aria-colindex={1}
                          data-csv-record-index={rowIndex}
                          data-csv-display-row={displayRowNumber}
                          aria-label={t("editor.csv.rowNumber", {
                            row: displayRowNumber,
                            record: rowIndex + 1,
                          })}
                          title={t("editor.csv.rowNumber", {
                            row: displayRowNumber,
                            record: rowIndex + 1,
                          })}
                        >
                          <span className="csv-table-editor__record-index-label" aria-hidden="true">
                            {displayRowNumber}
                          </span>
                        </th>
                      )}
                      {Array.from({ length: columnCount }, (_, columnIndex) => (
                        <td
                          className="csv-table-editor__body-cell"
                          key={`cell-${rowIndex}-${columnIndex}`}
                          data-csv-row={rowIndex}
                          data-csv-column={columnIndex}
                          data-find-match={csvFind.matchKeys.has(getCsvFindMatchKey({ rowIndex, columnIndex })) ? "true" : undefined}
                          data-find-current={csvFind.currentMatch?.rowIndex === rowIndex && csvFind.currentMatch.columnIndex === columnIndex ? "true" : undefined}
                          aria-colindex={columnIndex + ariaColumnOffset}
                        >
                          <input
                            value={row[columnIndex] ?? ""}
                            readOnly={readOnly}
                            onChange={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.value)}
                            aria-label={t("editor.csv.cell", {
                              row: displayRowNumber,
                              column: columnIndex + 1,
                            })}
                            aria-haspopup="menu"
                            aria-expanded="false"
                            data-csv-row={rowIndex}
                            data-csv-column={columnIndex}
                            spellCheck={false}
                          />
                        </td>
                      ))}
                      {Array.from({ length: previewAddedColumns }, (_, previewColumnIndex) => (
                        <td
                          className="csv-table-editor__body-cell csv-table-editor__expansion-cell csv-table-editor__expansion-cell--column"
                          key={`expansion-cell-${rowIndex}-${previewColumnIndex}`}
                          aria-hidden="true"
                        />
                      ))}
                    </tr>
                  );
                })}
                {Array.from({ length: previewAddedRows }, (_, previewRowIndex) => {
                  const displayRowNumber = structuralDataRowCount + previewRowIndex + 1;
                  return (
                    <tr
                      className="csv-table-editor__expansion-row"
                      key={`expansion-row-${previewRowIndex}`}
                      aria-hidden="true"
                    >
                      {rowNumbersVisible && (
                        <th className="csv-table-editor__record-index csv-table-editor__expansion-cell csv-table-editor__expansion-record-index">
                          <span className="csv-table-editor__record-index-label">
                            {displayRowNumber}
                          </span>
                        </th>
                      )}
                      {Array.from({ length: previewColumnCount }, (_, previewColumnIndex) => (
                        <td
                          className="csv-table-editor__body-cell csv-table-editor__expansion-cell"
                          key={`expansion-row-${previewRowIndex}-cell-${previewColumnIndex}`}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!readOnly && (
              <>
                <button
                  type="button"
                  className="csv-table-editor__structure-button csv-table-editor__add-row po-editable-table-structure-button po-editable-table-add-row"
                  onClick={addRow}
                  title={t("editor.csv.addRow")}
                  aria-label={t("editor.csv.addRow")}
                >
                  <span className="csv-table-editor__structure-button-visual po-editable-table-structure-button-visual" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="csv-table-editor__structure-button csv-table-editor__add-column po-editable-table-structure-button po-editable-table-add-column"
                  onClick={addColumn}
                  title={t("editor.csv.addColumn")}
                  aria-label={t("editor.csv.addColumn")}
                >
                  <span className="csv-table-editor__structure-button-visual po-editable-table-structure-button-visual" aria-hidden="true" />
                </button>
                <CsvTableControls
                  columnCount={columnCount}
                  direction={direction}
                  headerEnabled={headerEnabled}
                  locale={locale}
                  onOperation={applyStructureOperation}
                  rowNumbersVisible={rowNumbersVisible}
                  rowCount={matrix.length}
                  surfaceRef={surfaceRef}
                  tableRef={tableRef}
                  t={t}
                />
                <CsvTableResizeControl
                  currentColumnCount={columnCount}
                  currentDataRowCount={structuralDataRowCount}
                  direction={direction}
                  onExpand={expandTable}
                  onPreviewChange={setResizePreview}
                  t={t}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CsvTableEditor;

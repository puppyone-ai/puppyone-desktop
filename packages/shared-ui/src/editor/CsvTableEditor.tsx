"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  ensureShape,
  inferDelimiter,
  inferHeaderRow,
  normalizeRows,
  parseDelimitedText,
  stringifyDelimitedText,
  trimRows,
} from "./csv/csvDocument";
import { CsvTableControls } from "./csv/CsvTableControls";
import { CsvTableResizeControl } from "./csv/CsvTableResizeControl";
import { CsvTableSettings } from "./csv/CsvTableSettings";
import {
  applyCsvTableOperation,
  MAX_CSV_TABLE_DATA_ROWS,
  type CsvTableFocusTarget,
  type CsvTableStructureOperation,
} from "./csv/csvTableOperations";
import {
  readCsvFirstRecordAsHeaderPreference,
  writeCsvFirstRecordAsHeaderPreference,
} from "./csv/csvViewPreferences";
import { estimateEditableTableColumnWidths } from "./table/editableTableLayout";

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
  const headerPreferenceDocumentRef = useRef(documentId);
  const headerPreferenceInitializedRef = useRef(false);
  const columnCount = Math.max(1, ...matrix.map((row) => row.length));
  const dataRows = headerEnabled ? matrix.slice(1) : matrix;
  const visibleDataRows = dataRows.slice(0, MAX_CSV_TABLE_DATA_ROWS);
  const hiddenRowCount = Math.max(0, dataRows.length - visibleDataRows.length);
  const hasCsvSource = content.length > 0;
  const dataRowCount = hasCsvSource ? dataRows.length : 0;
  const structuralDataRowCount = Math.max(0, matrix.length - (headerEnabled ? 1 : 0));
  const visibleDataRowCount = Math.min(dataRowCount, visibleDataRows.length);
  const columnWidths = useMemo(
    () => estimateEditableTableColumnWidths(matrix, columnCount, (row) => row),
    [columnCount, matrix],
  );
  const surfaceRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const pendingFocusRef = useRef<CsvTableFocusTarget | null>(null);

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

  const emitMatrix = (nextMatrix: string[][], preserveShape = false) => {
    const serializableRows = preserveShape ? nextMatrix : trimRows(nextMatrix);
    onChange?.(stringifyDelimitedText(
      serializableRows,
      resolvedDelimiter,
      parsed.layout,
      { preserveTerminalEmptyRecord: preserveShape },
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
    emitMatrix(next, true);
  };

  const addColumn = () => {
    const next = ensureShape(matrix, Math.max(matrix.length, headerEnabled ? 1 : 0), columnCount + 1);
    for (const row of next) row[columnCount] = row[columnCount] ?? "";
    pendingFocusRef.current = {
      rowIndex: headerEnabled && next.length > 1 ? 1 : 0,
      columnIndex: columnCount,
    };
    emitMatrix(next, true);
  };

  const applyStructureOperation = (operation: CsvTableStructureOperation) => {
    const result = applyCsvTableOperation(matrix, headerEnabled, operation);
    pendingFocusRef.current = result.focus;
    emitMatrix(result.rows, true);
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

  const setFirstRecordAsHeader = (enabled: boolean) => {
    headerPreferenceInitializedRef.current = true;
    setHeaderEnabled(enabled);
    writeCsvFirstRecordAsHeaderPreference(documentId, enabled);
  };

  return (
    <section className="csv-table-editor" data-readonly={readOnly ? "true" : undefined}>
      <CsvTableSettings
        columnCount={columnCount}
        direction={direction}
        headerEnabled={headerEnabled}
        hiddenRowCount={hiddenRowCount}
        nodeName={nodeName || (resolvedDelimiter === "\t" ? "TSV" : "CSV")}
        onHeaderEnabledChange={setFirstRecordAsHeader}
        dataRowCount={dataRowCount}
        t={t}
        visibleDataRowCount={visibleDataRowCount}
        warning={parsed.warning}
      />

      <div className="csv-table-editor__scroll">
        <div className="csv-table-editor__frame">
          <div
            ref={surfaceRef}
            className="csv-table-editor__surface po-editable-table-interaction-root"
            data-header-enabled={headerEnabled ? "true" : undefined}
            dir={direction}
          >
            <table
              ref={tableRef}
              className="csv-table-editor__table"
              aria-label={nodeName || (resolvedDelimiter === "\t" ? "TSV" : "CSV")}
              aria-colcount={columnCount + 1}
              aria-rowcount={matrix.length}
            >
              <colgroup>
                <col className="csv-table-editor__record-index-column" />
                {columnWidths.map((width, columnIndex) => (
                  <col key={`column-${columnIndex}`} style={{ width }} />
                ))}
              </colgroup>
              {headerEnabled && (
                <thead>
                  <tr data-csv-row="0" aria-rowindex={1}>
                    <th
                      className="csv-table-editor__record-index csv-table-editor__record-index--header"
                      scope="row"
                      aria-colindex={1}
                      data-csv-record-index="0"
                      aria-label={t("editor.csv.headerRecord")}
                    />
                    {Array.from({ length: columnCount }, (_, columnIndex) => (
                      <th
                        className="csv-table-editor__header-cell"
                        scope="col"
                        key={`header-${columnIndex}`}
                        data-csv-row="0"
                        data-csv-column={columnIndex}
                        aria-colindex={columnIndex + 2}
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
                  </tr>
                </thead>
              )}
              <tbody>
                {visibleDataRows.map((row, visibleRowIndex) => {
                  const rowIndex = headerEnabled ? visibleRowIndex + 1 : visibleRowIndex;
                  const displayRowNumber = visibleRowIndex + 1;
                  return (
                    <tr key={`row-${rowIndex}`} data-csv-row={rowIndex} aria-rowindex={rowIndex + 1}>
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
                      {Array.from({ length: columnCount }, (_, columnIndex) => (
                        <td
                          className="csv-table-editor__body-cell"
                          key={`cell-${rowIndex}-${columnIndex}`}
                          data-csv-row={rowIndex}
                          data-csv-column={columnIndex}
                          aria-colindex={columnIndex + 2}
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
                  <span className="csv-table-editor__structure-button-visual po-editable-table-structure-button-visual" aria-hidden="true">+</span>
                </button>
                <button
                  type="button"
                  className="csv-table-editor__structure-button csv-table-editor__add-column po-editable-table-structure-button po-editable-table-add-column"
                  onClick={addColumn}
                  title={t("editor.csv.addColumn")}
                  aria-label={t("editor.csv.addColumn")}
                >
                  <span className="csv-table-editor__structure-button-visual po-editable-table-structure-button-visual" aria-hidden="true">+</span>
                </button>
                <CsvTableControls
                  columnCount={columnCount}
                  direction={direction}
                  headerEnabled={headerEnabled}
                  locale={locale}
                  onOperation={applyStructureOperation}
                  rowCount={matrix.length}
                  surfaceRef={surfaceRef}
                  tableRef={tableRef}
                  t={t}
                />
                <CsvTableResizeControl
                  columnWidths={columnWidths}
                  currentColumnCount={columnCount}
                  currentDataRowCount={structuralDataRowCount}
                  direction={direction}
                  onExpand={expandTable}
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

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";
import {
  ensureShape,
  inferDelimiter,
  inferHeaderRow,
  normalizeRows,
  parseDelimitedText,
  stringifyDelimitedText,
  toColumnLabel,
  trimRows,
} from "./csv/csvDocument";
import { estimateEditableTableColumnWidths } from "./table/editableTableLayout";

export type CsvTableEditorProps = {
  documentId?: string;
  content: string;
  nodeName?: string;
  delimiter?: "," | "\t";
  readOnly?: boolean;
  onChange?: (content: string) => void;
};

const MAX_RENDERED_CSV_ROWS = 10000;

export function CsvTableEditor({
  documentId,
  content,
  nodeName = "",
  delimiter,
  readOnly = true,
  onChange,
}: CsvTableEditorProps) {
  const { formatNumber, t } = useLocalization();
  const resolvedDelimiter = delimiter ?? inferDelimiter(nodeName, content);
  const parsed = useMemo(() => parseDelimitedText(content, resolvedDelimiter), [content, resolvedDelimiter]);
  const parsedRowsRef = useRef(parsed.rows);
  parsedRowsRef.current = parsed.rows;
  const matrix = useMemo(() => normalizeRows(parsed.rows), [parsed.rows]);
  const [headerEnabled, setHeaderEnabled] = useState(() => inferHeaderRow(parsed.rows));
  const columnCount = Math.max(1, ...matrix.map((row) => row.length));
  const dataRows = headerEnabled ? matrix.slice(1) : matrix;
  const visibleDataRows = dataRows.slice(0, MAX_RENDERED_CSV_ROWS);
  const hiddenRowCount = Math.max(0, dataRows.length - visibleDataRows.length);
  const rowCount = content.trim() ? dataRows.length : 0;
  const columnWidths = useMemo(
    () => estimateEditableTableColumnWidths(matrix, columnCount, (row) => row),
    [columnCount, matrix],
  );

  useLayoutEffect(() => {
    setHeaderEnabled(inferHeaderRow(parsedRowsRef.current));
  }, [documentId]);

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
    if (rowCount > 0 || headerEnabled) {
      next.push(Array.from({ length: columnCount }, () => ""));
    }
    emitMatrix(next, true);
  };

  const addColumn = () => {
    const next = ensureShape(matrix, Math.max(matrix.length, headerEnabled ? 1 : 0), columnCount + 1);
    for (const row of next) row[columnCount] = row[columnCount] ?? "";
    emitMatrix(next, true);
  };

  const deleteRow = (rowIndex: number) => {
    if (matrix.length <= 1) {
      emitMatrix([Array.from({ length: columnCount }, () => "")]);
      return;
    }
    emitMatrix(matrix.filter((_, index) => index !== rowIndex));
  };

  const deleteColumn = (columnIndex: number) => {
    if (columnCount <= 1) {
      emitMatrix(matrix.map(() => [""]));
      return;
    }
    emitMatrix(matrix.map((row) => row.filter((_, index) => index !== columnIndex)));
  };

  return (
    <section className="csv-table-editor" data-readonly={readOnly ? "true" : undefined}>
      <div className="csv-table-editor__toolbar">
        <div className="csv-table-editor__title">
          <strong dir="auto">{nodeName || (resolvedDelimiter === "\t" ? "TSV" : "CSV")}</strong>
          <span>{t("editor.csv.dimensions", { rows: rowCount, columns: columnCount })}</span>
        </div>
        <div className="csv-table-editor__actions">
          {parsed.warning && (
            <span className="csv-table-editor__warning">{t("editor.csv.warning.unclosedQuote")}</span>
          )}
          {hiddenRowCount > 0 && (
            <span className="csv-table-editor__warning">
              {t("editor.csv.visibleRows", { visible: visibleDataRows.length, total: dataRows.length })}
            </span>
          )}
          <label className="csv-table-editor__header-toggle">
            <input
              type="checkbox"
              checked={headerEnabled}
              onChange={(event) => setHeaderEnabled(event.currentTarget.checked)}
            />
            <span>{t("editor.csv.header")}</span>
          </label>
        </div>
      </div>

      <div className="csv-table-editor__scroll">
        <div className="csv-table-editor__frame">
          <div className="csv-table-editor__surface">
            <table
              className="csv-table-editor__table"
              aria-label={nodeName || (resolvedDelimiter === "\t" ? "TSV" : "CSV")}
              aria-colcount={columnCount + 1}
              aria-rowcount={rowCount + 1}
            >
              <colgroup>
                <col className="csv-table-editor__row-index-column" />
                {columnWidths.map((width, columnIndex) => (
                  <col key={`column-${columnIndex}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="csv-table-editor__corner" aria-hidden="true" />
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <th className="csv-table-editor__header-cell" scope="col" key={`header-${columnIndex}`}>
                      {headerEnabled ? (
                        <input
                          value={matrix[0]?.[columnIndex] ?? ""}
                          readOnly={readOnly}
                          onChange={(event) => updateCell(0, columnIndex, event.currentTarget.value)}
                          aria-label={t("editor.csv.columnHeader", { column: columnIndex + 1 })}
                          spellCheck={false}
                        />
                      ) : (
                        <span>{toColumnLabel(columnIndex)}</span>
                      )}
                      {!readOnly && (
                        <button
                          type="button"
                          className="csv-table-editor__cell-action"
                          onClick={() => deleteColumn(columnIndex)}
                          title={t("editor.csv.deleteColumn")}
                          aria-label={t("editor.csv.deleteColumnNumber", { column: columnIndex + 1 })}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleDataRows.length === 0 ? (
                  <tr>
                    <td className="csv-table-editor__empty" colSpan={columnCount + 1}>
                      {!readOnly && (
                        <button type="button" onClick={addRow}>
                          <Plus size={14} />
                          <span>{t("editor.csv.addRow")}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  visibleDataRows.map((row, visibleRowIndex) => {
                    const rowIndex = headerEnabled ? visibleRowIndex + 1 : visibleRowIndex;
                    return (
                      <tr key={`row-${rowIndex}`}>
                        <th className="csv-table-editor__row-number" scope="row">
                          <span>{formatNumber(visibleRowIndex + 1)}</span>
                          {!readOnly && (
                            <button
                              type="button"
                              className="csv-table-editor__cell-action"
                              onClick={() => deleteRow(rowIndex)}
                              title={t("editor.csv.deleteRow")}
                              aria-label={t("editor.csv.deleteRowNumber", { row: visibleRowIndex + 1 })}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </th>
                        {Array.from({ length: columnCount }, (_, columnIndex) => (
                          <td className="csv-table-editor__body-cell" key={`cell-${rowIndex}-${columnIndex}`}>
                            <input
                              value={row[columnIndex] ?? ""}
                              readOnly={readOnly}
                              onChange={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.value)}
                              aria-label={t("editor.csv.cell", {
                                row: visibleRowIndex + 1,
                                column: columnIndex + 1,
                              })}
                              spellCheck={false}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {!readOnly && (
              <>
                <button
                  type="button"
                  className="csv-table-editor__structure-button csv-table-editor__add-row"
                  onClick={addRow}
                  title={t("editor.csv.addRow")}
                  aria-label={t("editor.csv.addRow")}
                >
                  <span className="csv-table-editor__structure-button-visual" aria-hidden="true">+</span>
                </button>
                <button
                  type="button"
                  className="csv-table-editor__structure-button csv-table-editor__add-column"
                  onClick={addColumn}
                  title={t("editor.csv.addColumn")}
                  aria-label={t("editor.csv.addColumn")}
                >
                  <span className="csv-table-editor__structure-button-visual" aria-hidden="true">+</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CsvTableEditor;

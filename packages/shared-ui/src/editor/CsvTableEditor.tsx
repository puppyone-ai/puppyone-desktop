"use client";

import { Plus, Trash2 } from "lucide-react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocalization } from "@puppyone/localization/react";

export type CsvTableEditorProps = {
  documentId?: string;
  content: string;
  nodeName?: string;
  delimiter?: "," | "\t";
  readOnly?: boolean;
  onChange?: (content: string) => void;
};

type ParsedTable = {
  rows: string[][];
  warning?: "unclosed-quote";
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
  const gridTemplateColumns = `44px repeat(${columnCount}, minmax(128px, 1fr))`;

  useLayoutEffect(() => {
    setHeaderEnabled(inferHeaderRow(parsedRowsRef.current));
  }, [documentId]);

  const emitMatrix = (nextMatrix: string[][]) => {
    onChange?.(stringifyDelimitedText(trimRows(nextMatrix), resolvedDelimiter));
  };

  const updateCell = (rowIndex: number, columnIndex: number, value: string) => {
    const next = ensureShape(matrix, Math.max(matrix.length, rowIndex + 1), Math.max(columnCount, columnIndex + 1));
    next[rowIndex][columnIndex] = value;
    emitMatrix(next);
  };

  const addRow = () => {
    const next = ensureShape(matrix, matrix.length, columnCount);
    next.push(Array.from({ length: columnCount }, () => ""));
    emitMatrix(next);
  };

  const addColumn = () => {
    const next = ensureShape(matrix, Math.max(matrix.length, headerEnabled ? 1 : 0), columnCount + 1);
    for (const row of next) row[columnCount] = row[columnCount] ?? "";
    emitMatrix(next);
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
          {!readOnly && (
            <>
              <button type="button" onClick={addRow} title={t("editor.csv.addRow")} aria-label={t("editor.csv.addRow")}>
                <Plus size={15} />
              </button>
              <button type="button" onClick={addColumn} title={t("editor.csv.addColumn")} aria-label={t("editor.csv.addColumn")}>
                <Plus size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="csv-table-editor__scroll">
        <div className="csv-table-editor__grid" style={{ gridTemplateColumns }}>
          <div className="csv-table-editor__cell csv-table-editor__corner" />
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <div className="csv-table-editor__cell csv-table-editor__header-cell" key={`header-${columnIndex}`}>
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
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}

          {visibleDataRows.length === 0 ? (
            <div className="csv-table-editor__empty" style={{ gridColumn: `1 / span ${columnCount + 1}` }}>
              {!readOnly && (
                <button type="button" onClick={addRow}>
                  <Plus size={15} />
                  <span>{t("editor.csv.addRow")}</span>
                </button>
              )}
            </div>
          ) : (
            visibleDataRows.map((row, visibleRowIndex) => {
              const rowIndex = headerEnabled ? visibleRowIndex + 1 : visibleRowIndex;
              return (
                <Fragment key={`row-${rowIndex}`}>
                  <div className="csv-table-editor__cell csv-table-editor__row-number">
                    <span>{formatNumber(visibleRowIndex + 1)}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        className="csv-table-editor__cell-action"
                        onClick={() => deleteRow(rowIndex)}
                        title={t("editor.csv.deleteRow")}
                        aria-label={t("editor.csv.deleteRowNumber", { row: visibleRowIndex + 1 })}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <div className="csv-table-editor__cell csv-table-editor__body-cell" key={`cell-${rowIndex}-${columnIndex}`}>
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
                    </div>
                  ))}
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function inferDelimiter(name: string, content: string): "," | "\t" {
  if (name.toLowerCase().endsWith(".tsv")) return "\t";
  const sample = content.split(/\r?\n/).slice(0, 8).join("\n");
  const tabCount = (sample.match(/\t/g) ?? []).length;
  const commaCount = (sample.match(/,/g) ?? []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function inferHeaderRow(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const firstRow = rows[0] ?? [];
  const secondRow = rows[1] ?? [];
  if (firstRow.length === 0 || firstRow.every((cell) => !cell.trim())) return false;
  const textLikeHeaders = firstRow.filter((cell) => cell.trim() && !looksNumeric(cell)).length;
  const numericData = secondRow.filter((cell) => looksNumeric(cell)).length;
  return textLikeHeaders >= Math.max(1, Math.ceil(firstRow.length / 2)) || numericData > 0;
}

function parseDelimitedText(content: string, delimiter: "," | "\t"): ParsedTable {
  if (!content) return { rows: [[""]] };

  const rows: string[][] = [[]];
  let current = "";
  let inQuotes = false;
  let warning: ParsedTable["warning"];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === "\"") {
        if (content[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === delimiter) {
      rows[rows.length - 1].push(current);
      current = "";
    } else if (char === "\n" || char === "\r") {
      rows[rows.length - 1].push(current);
      current = "";
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      rows.push([]);
    } else {
      current += char;
    }
  }

  rows[rows.length - 1].push(current);

  if (inQuotes) warning = "unclosed-quote";
  if (content.endsWith("\n") || content.endsWith("\r")) {
    const lastRow = rows[rows.length - 1];
    if (lastRow.length === 1 && lastRow[0] === "") rows.pop();
  }

  return { rows: rows.length > 0 ? rows : [[""]], warning };
}

function stringifyDelimitedText(rows: string[][], delimiter: "," | "\t"): string {
  return rows
    .map((row) => row.map((cell) => serializeCell(cell, delimiter)).join(delimiter))
    .join("\n");
}

function serializeCell(value: string, delimiter: "," | "\t"): string {
  const mustQuote = value.includes(delimiter)
    || value.includes("\"")
    || value.includes("\n")
    || value.includes("\r")
    || value !== value.trim();
  return mustQuote ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function normalizeRows(rows: string[][]): string[][] {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  return ensureShape(rows, Math.max(rows.length, 1), columnCount);
}

function ensureShape(rows: string[][], rowCount: number, columnCount: number): string[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const sourceRow = rows[rowIndex] ?? [];
    return Array.from({ length: columnCount }, (_, columnIndex) => sourceRow[columnIndex] ?? "");
  });
}

function trimRows(rows: string[][]): string[][] {
  let lastRowIndex = rows.length - 1;
  while (lastRowIndex > 0 && rows[lastRowIndex].every((cell) => cell === "")) {
    lastRowIndex -= 1;
  }

  const slicedRows = rows.slice(0, lastRowIndex + 1);
  let lastColumnIndex = Math.max(0, ...slicedRows.map((row) => row.length - 1));
  while (lastColumnIndex > 0 && slicedRows.every((row) => (row[lastColumnIndex] ?? "") === "")) {
    lastColumnIndex -= 1;
  }

  return slicedRows.map((row) => row.slice(0, lastColumnIndex + 1));
}

function looksNumeric(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed));
}

function toColumnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export default CsvTableEditor;

/**
 * @vitest-environment happy-dom
 */
import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CsvTableEditor } from "../packages/shared-ui/src/editor/CsvTableEditor";
import { CsvTableResizeControl } from "../packages/shared-ui/src/editor/csv/CsvTableResizeControl";
import { testT, withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latestSnapshot = "";
let changeCount = 0;

beforeEach(async () => {
  window.localStorage.clear();
  latestSnapshot = "Name,Score\nAda,1\nLin,2";
  changeCount = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(withTestLocalization(<Harness />));
    await Promise.resolve();
  });
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
  await act(async () => Promise.resolve());
});

describe("CSV table interactions", () => {
  it("keeps data-row numbers inside the frame while compact settings control header semantics", async () => {
    expect(container?.querySelector(".csv-table-editor__toolbar")).toBeNull();
    expect(container?.querySelector(".csv-table-editor__settings-button")).toBeInstanceOf(HTMLButtonElement);
    expect(container?.querySelectorAll(".csv-table-editor__header-cell")).toHaveLength(2);
    expect(container?.querySelector(".csv-table-editor__record-index--header")?.textContent).toBe("");
    expect(Array.from(container?.querySelectorAll(".csv-table-editor__record-index-label") ?? [])
      .map((label) => label.textContent?.trim())).toEqual(["1", "2"]);
    expect(container?.querySelectorAll(".csv-table-editor__record-index input")).toHaveLength(0);
    expect(container?.querySelector("[data-csv-display-row='1']")?.getAttribute("title"))
      .toBe("Data row 1; CSV record 2");

    const settings = container?.querySelector<HTMLButtonElement>(".csv-table-editor__settings-button");
    act(() => settings?.click());
    const headerToggle = findButton("Use first record as header");
    expect(headerToggle?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(headerToggle?.getAttribute("aria-checked")).toBe("true");
    expect(headerToggle?.textContent).toContain("Changes display only; CSV content is unchanged.");
    expect(document.querySelector(".csv-table-editor__settings-summary")?.textContent)
      .toContain("2 rows × 2 columns · header");
    expect(document.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(1);
    act(() => headerToggle?.click());
    expect(container?.querySelector(".csv-table-editor__table thead")).toBeNull();
    expect(document.querySelector(".csv-table-editor__settings-summary")?.textContent)
      .toContain("3 rows × 2 columns");
    expect(Array.from(container?.querySelectorAll(".csv-table-editor__record-index-label") ?? [])
      .map((label) => label.textContent?.trim())).toEqual(["1", "2", "3"]);
    expect(latestSnapshot).toBe("Name,Score\nAda,1\nLin,2");

    await act(async () => {
      root?.unmount();
      root = createRoot(container!);
      root.render(withTestLocalization(<Harness />));
      await Promise.resolve();
    });
    expect(container?.querySelector(".csv-table-editor__table thead")).toBeNull();
  });

  it("defaults ambiguous all-text CSV content to data rows instead of silently promoting a header", async () => {
    latestSnapshot = "Name,City\nAda,London";
    await act(async () => {
      root?.unmount();
      root = createRoot(container!);
      root.render(withTestLocalization(<Harness documentId="ambiguous.csv" />));
      await Promise.resolve();
    });

    expect(container?.querySelector(".csv-table-editor__table thead")).toBeNull();
    expect(Array.from(container?.querySelectorAll(".csv-table-editor__record-index-label") ?? [])
      .map((label) => label.textContent?.trim())).toEqual(["1", "2"]);
    act(() => container?.querySelector<HTMLButtonElement>(".csv-table-editor__settings-button")?.click());
    expect(findButton("Use first record as header")?.getAttribute("aria-checked")).toBe("false");
  });

  it("expands to a selected row and column shape from the corner picker in one snapshot", async () => {
    const resizeHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__resize-handle");
    if (!resizeHandle) throw new Error("CSV resize handle did not mount.");

    act(() => resizeHandle.click());
    const target = document.querySelector<HTMLButtonElement>(
      ".csv-table-editor__resize-picker-cell[data-added-rows='2'][data-added-columns='3']",
    );
    expect(target?.getAttribute("aria-label")).toBe("Expand to 4 rows × 5 columns");

    const changesBeforeExpansion = changeCount;
    await act(async () => {
      target?.click();
      await Promise.resolve();
    });
    expect(changeCount).toBe(changesBeforeExpansion + 1);
    expect(latestSnapshot).toBe("Name,Score,,,\nAda,1,,,\nLin,2,,,\n,,,,\n,,,,");
    expect(document.querySelector(".csv-table-editor__resize-picker")).toBeNull();
  });

  it("previews outward corner dragging and treats inward dragging as a non-destructive cancel", async () => {
    mockTableGeometry();
    const resizeHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__resize-handle");
    if (!resizeHandle) throw new Error("CSV resize handle did not mount.");
    makePointerCaptureSafe(resizeHandle);

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 300, 200, 9));
      resizeHandle.dispatchEvent(pointerEvent("pointermove", 493, 263, 9));
      await Promise.resolve();
    });
    expect(document.querySelector(".csv-table-editor__resize-status")?.textContent)
      .toContain("5 rows × 5 columns");
    const previewRows = document.querySelector<HTMLElement>(".csv-table-editor__resize-preview-rows");
    expect(previewRows?.style.gridTemplateColumns).toBe(
      "var(--csv-table-record-index-width) 96px 96px 96px 96px 96px",
    );
    expect(previewRows?.querySelectorAll(".csv-table-editor__resize-preview-track--record-index"))
      .toHaveLength(1);
    expect(previewRows?.querySelectorAll(".csv-table-editor__resize-preview-track--data"))
      .toHaveLength(5);
    expect(Array.from(
      previewRows?.querySelectorAll(".csv-table-editor__resize-preview-cell--record-index") ?? [],
      (cell) => cell.textContent,
    )).toEqual(["3", "4", "5"]);
    expect(previewRows?.querySelectorAll(".csv-table-editor__resize-preview-cell--data"))
      .toHaveLength(15);
    expect(document.querySelectorAll(
      ".csv-table-editor__resize-preview-columns > .csv-table-editor__resize-preview-track--data",
    )).toHaveLength(3);

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointerup", 493, 263, 9));
      await Promise.resolve();
    });
    expect(latestSnapshot).toBe("Name,Score,,,\nAda,1,,,\nLin,2,,,\n,,,,\n,,,,\n,,,,");

    const expandedSnapshot = latestSnapshot;
    makePointerCaptureSafe(resizeHandle);
    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 300, 200, 10));
      resizeHandle.dispatchEvent(pointerEvent("pointermove", 240, 150, 10));
      resizeHandle.dispatchEvent(pointerEvent("pointerup", 240, 150, 10));
      await Promise.resolve();
    });
    expect(latestSnapshot).toBe(expandedSnapshot);
  });

  it("aligns a downward preview to the record gutter and content-sized columns", async () => {
    latestSnapshot = `Name,Description\nAda,${"x".repeat(60)}`;
    await act(async () => {
      root?.unmount();
      root = createRoot(container!);
      root.render(withTestLocalization(<Harness documentId="wide-table.csv" />));
      await Promise.resolve();
    });
    const resizeHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__resize-handle");
    if (!resizeHandle) throw new Error("CSV resize handle did not mount.");
    makePointerCaptureSafe(resizeHandle);

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 300, 200, 21));
      resizeHandle.dispatchEvent(pointerEvent("pointermove", 300, 231, 21));
      await Promise.resolve();
    });

    const previewRows = document.querySelector<HTMLElement>(".csv-table-editor__resize-preview-rows");
    expect(previewRows?.style.gridTemplateColumns)
      .toBe("var(--csv-table-record-index-width) 96px 280px");
    expect(previewRows?.firstElementChild?.classList)
      .toContain("csv-table-editor__resize-preview-track--record-index");
    expect(previewRows?.querySelector(".csv-table-editor__resize-preview-cell--record-index")?.textContent)
      .toBe("3");
    expect(document.querySelector(".csv-table-editor__resize-preview-columns")).toBeNull();

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointercancel", 300, 231, 21));
      await Promise.resolve();
    });
  });

  it("uses the full editor height and clamps a pointer dragged beyond it", async () => {
    mockTableGeometry();
    const resizeHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__resize-handle");
    if (!resizeHandle) throw new Error("CSV resize handle did not mount.");
    makePointerCaptureSafe(resizeHandle);

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 300, 200, 25));
      resizeHandle.dispatchEvent(pointerEvent("pointermove", 300, 2000, 25));
      await Promise.resolve();
    });

    expect(document.querySelector(".csv-table-editor__resize-status")?.textContent)
      .toContain("17 rows × 2 columns");
    expect(document.querySelector<HTMLElement>(".csv-table-editor__resize-preview")
      ?.style.getPropertyValue("--csv-table-resize-added-height"))
      .toBe("465px");

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointercancel", 300, 2000, 25));
      await Promise.resolve();
    });
  });

  it("keeps picker row semantics when fewer than six columns remain available", async () => {
    await act(async () => {
      root?.unmount();
      root = createRoot(container!);
      root.render(
        <CsvTableResizeControl
          columnWidths={Array.from({ length: 254 }, () => 96)}
          currentColumnCount={254}
          currentDataRowCount={2}
          direction="ltr"
          onExpand={vi.fn()}
          t={testT}
        />,
      );
      await Promise.resolve();
    });

    act(() => container?.querySelector<HTMLButtonElement>(".csv-table-editor__resize-handle")?.click());
    const pickerGrid = document.querySelector<HTMLElement>(".csv-table-editor__resize-picker-grid");
    expect(pickerGrid?.getAttribute("aria-colcount")).toBe("2");
    expect(pickerGrid?.getAttribute("aria-rowcount")).toBe("6");
    const pickerRows = Array.from(pickerGrid?.querySelectorAll<HTMLElement>(":scope > [role='row']") ?? []);
    expect(pickerRows).toHaveLength(6);
    for (const pickerRow of pickerRows) {
      expect(pickerRow.style.gridTemplateColumns).toBe("repeat(2, 16px)");
      expect(pickerRow.querySelectorAll(":scope > [role='gridcell']")).toHaveLength(2);
    }
  });

  it("uses the same logical preview tracks for an outward RTL drag", async () => {
    await act(async () => {
      root?.unmount();
      root = createRoot(container!);
      root.render(
        <CsvTableResizeControl
          columnWidths={[120, 180]}
          currentColumnCount={2}
          currentDataRowCount={2}
          direction="rtl"
          onExpand={vi.fn()}
          t={testT}
        />,
      );
      await Promise.resolve();
    });
    const resizeHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__resize-handle");
    if (!resizeHandle) throw new Error("CSV resize handle did not mount.");
    makePointerCaptureSafe(resizeHandle);

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 300, 200, 31));
      resizeHandle.dispatchEvent(pointerEvent("pointermove", 204, 231, 31));
      await Promise.resolve();
    });

    expect(container?.querySelector(".csv-table-editor__resize-control")?.getAttribute("dir")).toBe("rtl");
    expect(document.querySelector<HTMLElement>(".csv-table-editor__resize-preview-rows")
      ?.style.gridTemplateColumns)
      .toBe("var(--csv-table-record-index-width) 120px 180px 96px");
    expect(document.querySelectorAll(
      ".csv-table-editor__resize-preview-columns > .csv-table-editor__resize-preview-track--data",
    )).toHaveLength(1);

    await act(async () => {
      resizeHandle.dispatchEvent(pointerEvent("pointercancel", 204, 231, 31));
      await Promise.resolve();
    });
  });

  it("opens a row-scoped menu from the same hover handle used for dragging", async () => {
    const geometry = mockTableGeometry();
    act(() => geometry.firstRecordIndexCell.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    const rowHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__row-handle");
    if (!rowHandle) throw new Error("CSV row handle did not mount.");
    makePointerCaptureSafe(rowHandle);
    mockRect(rowHandle.querySelector(".po-editable-table-drag-handle-visual")!, rect(126, 134, 10, 24));
    expect(rowHandle.classList.contains("is-visible")).toBe(true);
    expect(rowHandle.getAttribute("aria-label")).toBe("Actions for row 1");
    expect(rowHandle.style.left).toBe("31px");
    expect(geometry.firstRecordIndexCell.querySelector(".csv-table-editor__record-index-label")?.textContent)
      .toBe("1");

    await act(async () => {
      rowHandle.dispatchEvent(pointerEvent("pointerdown", 131, 145, 7));
      rowHandle.dispatchEvent(pointerEvent("pointerup", 131, 145, 7));
      await Promise.resolve();
    });

    const menu = document.querySelector(".csv-table-editor__context-menu");
    expect(menu).not.toBeNull();
    expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(6);
    expect(rowHandle.getAttribute("aria-expanded")).toBe("true");

    const moveDown = findButton("Move row down");
    await act(async () => {
      moveDown?.click();
      await Promise.resolve();
    });
    expect(latestSnapshot).toBe("Name,Score\nLin,2\nAda,1");
    expect(document.querySelector(".csv-table-editor__context-menu")).toBeNull();
  });

  it("opens the complete row and column operation set from a cell context menu", async () => {
    const geometry = mockTableGeometry();
    await act(async () => {
      geometry.firstBodyCell.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 142,
      }));
      await Promise.resolve();
    });

    const menu = document.querySelector(".csv-table-editor__context-menu");
    expect(menu?.querySelectorAll(".desktop-menu-section")).toHaveLength(2);
    expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(11);
    const moveColumnRight = findButton("Move column right");
    await act(async () => {
      moveColumnRight?.click();
      await Promise.resolve();
    });
    expect(latestSnapshot).toBe("Score,Name\n1,Ada\n2,Lin");
  });

  it("keeps header cells column-scoped instead of showing disabled row actions", async () => {
    const geometry = mockTableGeometry();
    await act(async () => {
      geometry.firstHeaderCell.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 168,
        clientY: 116,
      }));
      await Promise.resolve();
    });

    const menu = document.querySelector(".csv-table-editor__context-menu");
    expect(menu?.querySelectorAll(".desktop-menu-section")).toHaveLength(1);
    expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(5);
    expect(menu?.querySelector(".desktop-menu-section-label")?.textContent).toBe("Columns");
    expect(findButton("Insert row below")).toBeNull();
  });

  it("drags rows and columns using midpoint drop boundaries", async () => {
    let geometry = mockTableGeometry();
    act(() => geometry.firstRecordIndexCell.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    const rowHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__row-handle");
    if (!rowHandle) throw new Error("CSV row handle did not mount.");
    makePointerCaptureSafe(rowHandle);

    await act(async () => {
      rowHandle.dispatchEvent(pointerEvent("pointerdown", 118, 145, 9));
      rowHandle.dispatchEvent(pointerEvent("pointermove", 118, 181, 9));
      rowHandle.dispatchEvent(pointerEvent("pointerup", 118, 181, 9));
      await Promise.resolve();
    });
    expect(latestSnapshot).toBe("Name,Score\nLin,2\nAda,1");

    geometry = mockTableGeometry();
    act(() => geometry.firstBodyCell.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
    const columnHandle = container?.querySelector<HTMLButtonElement>(".csv-table-editor__column-handle");
    if (!columnHandle) throw new Error("CSV column handle did not mount.");
    makePointerCaptureSafe(columnHandle);

    await act(async () => {
      columnHandle.dispatchEvent(pointerEvent("pointerdown", 184, 92, 11));
      columnHandle.dispatchEvent(pointerEvent("pointermove", 320, 92, 11));
      columnHandle.dispatchEvent(pointerEvent("pointerup", 320, 92, 11));
      await Promise.resolve();
    });
    expect(latestSnapshot).toBe("Score,Name\n2,Lin\n1,Ada");
  });
});

function Harness({ documentId = "table.csv" }: { documentId?: string }) {
  const [content, setContent] = useState(latestSnapshot);
  return (
    <CsvTableEditor
      content={content}
      documentId={documentId}
      nodeName="table.csv"
      readOnly={false}
      onChange={(next) => {
        changeCount += 1;
        latestSnapshot = next;
        setContent(next);
      }}
    />
  );
}

function mockTableGeometry() {
  const surface = container?.querySelector<HTMLElement>(".csv-table-editor__surface");
  const scrollContainer = container?.querySelector<HTMLElement>(".csv-table-editor__scroll");
  const table = container?.querySelector<HTMLTableElement>(".csv-table-editor__table");
  const headerRecordCell = container?.querySelector<HTMLTableCellElement>("thead [data-csv-record-index]");
  const headerCells = Array.from(container?.querySelectorAll<HTMLTableCellElement>("thead th[data-csv-column]") ?? []);
  const bodyRows = Array.from(container?.querySelectorAll<HTMLTableRowElement>("tbody tr") ?? []);
  if (!surface || !scrollContainer || !table || !headerRecordCell || headerCells.length !== 2 || bodyRows.length !== 2) {
    throw new Error("CSV table geometry could not be prepared.");
  }
  mockRect(scrollContainer, rect(80, 70, 800, 600));
  mockRect(surface, rect(100, 100, 223, 93));
  mockRect(table, rect(100, 100, 223, 93));
  mockRect(headerRecordCell, rect(100, 100, 31, 31));
  headerCells.forEach((cell, index) => mockRect(cell, rect(131 + index * 96, 100, 96, 31)));
  bodyRows.forEach((row, rowIndex) => {
    mockRect(row, rect(100, 131 + rowIndex * 31, 223, 31));
    const recordIndexCell = row.querySelector<HTMLTableCellElement>("[data-csv-record-index]");
    if (!recordIndexCell) throw new Error("CSV record index cell did not mount.");
    mockRect(recordIndexCell, rect(100, 131 + rowIndex * 31, 31, 31));
    Array.from(row.querySelectorAll<HTMLTableCellElement>("td[data-csv-column]")).forEach((cell, columnIndex) => {
      mockRect(cell, rect(131 + columnIndex * 96, 131 + rowIndex * 31, 96, 31));
    });
  });
  const firstBodyCell = bodyRows[0].querySelector<HTMLTableCellElement>("td[data-csv-column='0']");
  const firstRecordIndexCell = bodyRows[0].querySelector<HTMLTableCellElement>("[data-csv-record-index]");
  if (!firstBodyCell || !firstRecordIndexCell) throw new Error("CSV first data row did not mount.");
  return { firstBodyCell, firstHeaderCell: headerCells[0], firstRecordIndexCell };
}

function findButton(label: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => (
      button.querySelector(".desktop-menu-item-label")?.textContent?.trim()
      ?? button.textContent?.trim()
    ) === label) ?? null;
}

function pointerEvent(type: string, clientX: number, clientY: number, pointerId: number) {
  return new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY, pointerId });
}

function makePointerCaptureSafe(handle: HTMLElement) {
  let capturedPointer: number | null = null;
  Object.defineProperties(handle, {
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => capturedPointer === pointerId,
    },
    releasePointerCapture: {
      configurable: true,
      value: (pointerId: number) => {
        if (capturedPointer === pointerId) capturedPointer = null;
      },
    },
    setPointerCapture: {
      configurable: true,
      value: (pointerId: number) => {
        capturedPointer = pointerId;
      },
    },
  });
}

function mockRect(element: Element, value: DOMRect) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => value,
  });
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

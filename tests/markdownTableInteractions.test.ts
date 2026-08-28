/**
 * @vitest-environment happy-dom
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../packages/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import { closeActiveMarkdownTableMenu } from "../packages/shared-ui/src/editor/markdown/features/table/tableMenuState";
import { markdownLocalizationExtension } from "../packages/shared-ui/src/editor/markdown/core/editor/markdownLocalization";
import { testT } from "./testLocalization";
import { focusMarkdownTableCell } from "../packages/shared-ui/src/editor/markdown/features/table/tableFocus";
import { getMarkdownPlanIndex } from "../packages/shared-ui/src/editor/markdown/core/plans/markdownPlanIndex";

const TABLE_SOURCE = [
  "| A | B | C |",
  "| --- | --- | --- |",
  "| one | two | three |",
  "| four | five | six |",
].join("\n");

const views: EditorView[] = [];

afterEach(() => {
  closeActiveMarkdownTableMenu();
  while (views.length > 0) views.pop()?.destroy();
  document.body.replaceChildren();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function createTableView(source = TABLE_SOURCE) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        ...markdownCodeMirrorBaseExtensions(false),
        markdownLocalizationExtension({
          direction: "ltr",
          formatNumber: (value) => String(value),
          locale: "en",
          t: testT,
        }, false),
        markdownLivePreviewExtension("safe", null, "table.md"),
      ],
    }),
  });
  views.push(view);
  return view;
}

function source(view: EditorView) {
  return view.state.doc.toString();
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
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

function mockRect(element: Element, value: DOMRect) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => value,
  });
}

function makeHandleCaptureSafe(handle: HTMLElement) {
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

function mockHorizontalScroller(element: HTMLElement, clientWidth: number, scrollWidth: number) {
  let scrollLeft = 0;
  Object.defineProperties(element, {
    clientWidth: { configurable: true, get: () => clientWidth },
    scrollWidth: { configurable: true, get: () => scrollWidth },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value; },
    },
  });
}

describe("Markdown table EditorView interactions", () => {
  it("defines stable semantic column tracks before a rich cell enters edit mode", () => {
    const view = createTableView([
      "| **Name** | Value |",
      "| --- | --- |",
      "| Alpha | Beta |",
    ].join("\n"));
    const table = view.dom.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    const columns = Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"));
    const widths = columns.map((column) => column.style.width);
    const firstCell = table.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="0"][data-md-table-column="0"]',
    )!;

    expect(columns).toHaveLength(2);
    expect(widths.every((width) => /^\d+px$/.test(width))).toBe(true);

    firstCell.focus();
    expect(firstCell.textContent).toBe("**Name**");
    expect(Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"))
      .map((column) => column.style.width)).toEqual(widths);

    firstCell.blur();
    expect(Array.from(table.querySelectorAll<HTMLTableColElement>("colgroup col"))
      .map((column) => column.style.width)).toEqual(widths);
  });

  it("caps compact initial tracks at 220px", () => {
    const view = createTableView([
      `| ${"wide ".repeat(80)} | B |`,
      "| --- | --- |",
      "| Alpha | Beta |",
    ].join("\n"));
    const widths = Array.from(
      view.dom.querySelectorAll<HTMLTableColElement>(".cm-md-table-widget colgroup col"),
      (column) => column.style.width,
    );

    expect(widths[0]).toBe("220px");
    expect(Number.parseInt(widths[1] ?? "0", 10)).toBeLessThanOrEqual(220);

    const firstHeader = view.dom.querySelector<HTMLTableCellElement>("thead th")!;
    firstHeader.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    view.dom.querySelector<HTMLElement>(".cm-md-table-column-resize-handle")
      ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(view.dom.querySelector<HTMLTableColElement>(
      '.cm-md-table-widget col[data-md-table-column="0"]',
    )?.style.width).toBe("280px");

    const columnHandle = view.dom.querySelector<HTMLElement>(".cm-md-table-column-handle")!;
    makeHandleCaptureSafe(columnHandle);
    columnHandle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 30,
    }));
    columnHandle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      pointerId: 30,
    }));
    Array.from(document.querySelectorAll<HTMLButtonElement>(
      ".cm-md-table-context-menu button",
    )).find((button) => button.textContent?.includes("Reset column widths"))?.click();
    expect(view.dom.querySelector<HTMLTableColElement>(
      '.cm-md-table-widget col[data-md-table-column="0"]',
    )?.style.width).toBe("220px");
  });

  it("keeps a user-resized track stable across content commits and reopening", () => {
    const view = createTableView();
    const surface = view.dom.querySelector<HTMLElement>(".cm-md-table-surface")!;
    const table = view.dom.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    const firstHeader = table.querySelector<HTMLTableCellElement>("thead th")!;
    const firstColumn = table.querySelector<HTMLTableColElement>(
      'col[data-md-table-column="0"]',
    )!;
    const startWidth = Number.parseInt(firstColumn.style.width, 10);
    mockRect(surface, rect(0, 0, 320, 140));
    mockRect(table, rect(0, 20, 300, 110));
    mockRect(firstHeader, rect(0, 20, startWidth, 31));

    firstHeader.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const resizeHandle = view.dom.querySelector<HTMLElement>(
      ".cm-md-table-column-resize-handle",
    )!;
    expect(resizeHandle.classList.contains("is-visible")).toBe(true);
    makeHandleCaptureSafe(resizeHandle);
    resizeHandle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: startWidth,
      pointerId: 31,
    }));
    resizeHandle.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientX: startWidth + 84,
      pointerId: 31,
    }));
    resizeHandle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      clientX: startWidth + 84,
      pointerId: 31,
    }));
    const resizedWidth = startWidth + 84;
    expect(firstColumn.style.width).toBe(`${resizedWidth}px`);

    const firstBodyCell = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="1"][data-md-table-column="0"]',
    )!;
    firstBodyCell.focus();
    firstBodyCell.textContent = "a much longer value that must not resize the table geometry";
    firstBodyCell.dispatchEvent(new InputEvent("input", { bubbles: true }));
    firstBodyCell.blur();

    const replacementRoot = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    expect(replacementRoot.dataset.mdTableColumnLayoutSession).toBeTruthy();
    expect(replacementRoot.querySelector<HTMLTableColElement>(
      'col[data-md-table-column="0"]',
    )?.style.width).toBe(`${resizedWidth}px`);

    const reopened = createTableView(source(view));
    expect(reopened.dom.querySelector<HTMLTableColElement>(
      '.cm-md-table-widget col[data-md-table-column="0"]',
    )?.style.width).toBe(`${resizedWidth}px`);
  });

  it("renders adjacent prose as editor text instead of synthetic table rows", () => {
    const prose = "这里面有几个要素值得注意。";
    const view = createTableView(`${TABLE_SOURCE}\n${prose}`);
    const wrapper = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    const rows = wrapper.querySelectorAll("tr[data-md-table-row]");

    expect(rows).toHaveLength(3);
    expect(wrapper.textContent).not.toContain(prose);
    expect(Array.from(view.dom.querySelectorAll(".cm-line")).some((line) => (
      line.textContent?.includes(prose)
    ))).toBe(true);

    wrapper.querySelector<HTMLButtonElement>(".cm-md-table-add-row")?.click();
    expect(source(view)).toContain(`\n${prose}`);
    expect(source(view).split("\n").filter((line) => line === prose)).toHaveLength(1);
  });

  it("keeps prose typed directly after a table in the normal editor surface", () => {
    const view = createTableView(`${TABLE_SOURCE}\n`);
    const prose = "正文会留在表格外。";
    expect(view.dom.querySelector(".cm-md-table-widget-wrap")).not.toBeNull();

    for (const character of prose) {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: character },
        selection: { anchor: view.state.doc.length + character.length },
        userEvent: "input.type",
      });
      const tablePlan = getMarkdownPlanIndex(view.state).find(({ plan }) => (
        plan.presentation === "blockAtom" && plan.embed.kind === "table"
      ));
      expect(tablePlan?.plan.sourceRange, `table plan after typing ${character}`).toEqual({
        from: 0,
        to: TABLE_SOURCE.length,
      });
      expect(
        view.dom.querySelector(".cm-md-table-widget-wrap"),
        `table widget after typing ${character}`,
      ).not.toBeNull();
    }

    const wrapper = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    expect(wrapper.querySelectorAll("tr[data-md-table-row]")).toHaveLength(3);
    expect(wrapper.textContent).not.toContain(prose);
    expect(source(view)).toBe(`${TABLE_SOURCE}\n${prose}`);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(Array.from(view.dom.querySelectorAll(".cm-line")).some((line) => (
      line.textContent?.includes(prose)
    ))).toBe(true);
  });

  it("adds rows and columns and restores logical focus after the view update", async () => {
    const view = createTableView();
    const addRow = view.dom.querySelector<HTMLButtonElement>(".cm-md-table-add-row");
    expect(addRow).not.toBeNull();
    const addRowVisual = addRow?.querySelector<HTMLElement>(".cm-md-table-structure-button-visual");
    expect(addRowVisual).not.toBeNull();
    expect(addRowVisual?.textContent).toBe("");
    expect(addRowVisual?.classList.contains("po-editable-table-structure-button-visual")).toBe(true);
    expect(addRowVisual?.getAttribute("aria-hidden")).toBe("true");
    expect(() => addRow?.click()).not.toThrow();
    expect(source(view).split("\n")).toHaveLength(5);
    await nextAnimationFrame();
    expect((document.activeElement as HTMLElement | null)?.dataset.mdTableRow).toBe("3");
    expect((document.activeElement as HTMLElement | null)?.dataset.mdTableColumn).toBe("0");

    const addColumn = view.dom.querySelector<HTMLButtonElement>(".cm-md-table-add-column");
    expect(addColumn).not.toBeNull();
    expect(() => addColumn?.click()).not.toThrow();
    expect(source(view).split("\n")[0]?.match(/\|/g)).toHaveLength(5);
    await nextAnimationFrame();
    expect((document.activeElement as HTMLElement | null)?.dataset.mdTableRow).toBe("0");
    expect((document.activeElement as HTMLElement | null)?.dataset.mdTableColumn).toBe("3");
  });

  it("targets the current table range after an earlier edit outside its projection patch", () => {
    const prefix = [
      "Top",
      "",
      "Paragraph one",
      "Paragraph two",
      "Paragraph three",
      "",
    ].join("\n");
    const view = createTableView(`${prefix}${TABLE_SOURCE}\nOutro`);
    const tableBeforeEdit = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap");
    if (!tableBeforeEdit) throw new Error("Table did not mount before the edit");

    view.dispatch({
      changes: {
        from: view.state.doc.line(2).to,
        insert: "\nInserted before the table",
      },
    });

    const tableAfterEdit = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap");
    expect(tableAfterEdit).toBe(tableBeforeEdit);
    tableAfterEdit?.querySelector<HTMLButtonElement>(".cm-md-table-add-row")?.click();

    expect(source(view)).toContain("Paragraph two");
    expect(source(view)).toMatch(/\| four \| five \| six\s+\|\n\|\s+\|\s+\|\s+\|\nOutro/);
  });

  it("commits a cell to the current table range after an earlier mapped edit", () => {
    const prefix = [
      "Top",
      "",
      "Paragraph one",
      "Paragraph two",
      "Paragraph three",
      "",
    ].join("\n");
    const view = createTableView(`${prefix}${TABLE_SOURCE}\nOutro`);
    const tableBeforeEdit = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap");
    if (!tableBeforeEdit) throw new Error("Table did not mount before the edit");

    view.dispatch({
      changes: {
        from: view.state.doc.line(2).to,
        insert: "\nInserted before the table",
      },
    });

    const tableAfterEdit = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap");
    expect(tableAfterEdit).toBe(tableBeforeEdit);
    const firstBodyCell = tableAfterEdit?.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="1"][data-md-table-column="0"]',
    );
    if (!firstBodyCell) throw new Error("Editable table cell did not mount");
    firstBodyCell.focus();
    firstBodyCell.textContent = "updated";
    firstBodyCell.dispatchEvent(new InputEvent("input", { bubbles: true }));
    firstBodyCell.blur();

    expect(source(view)).toContain("Paragraph two");
    expect(source(view)).toContain("| updated | two | three |");
  });

  it("keeps the inline viewport session across a structural Widget replacement", async () => {
    const view = createTableView();
    const firstRoot = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    const firstViewport = firstRoot.querySelector<HTMLElement>(".cm-md-table-scrollport")!;
    const firstSessionId = firstRoot.dataset.mdInlineViewportSession;
    const firstColumnLayoutSessionId = firstRoot.dataset.mdTableColumnLayoutSession;
    const firstColumnWidths = Array.from(
      firstRoot.querySelectorAll<HTMLTableColElement>("colgroup col"),
      (column) => column.style.width,
    );
    expect(firstSessionId).toBeTruthy();
    expect(firstColumnLayoutSessionId).toBeTruthy();
    expect(firstRoot.dataset.mdTableInlineViewport).toBe("true");
    expect(firstViewport.dataset.poScrollbar).toBe("hidden");
    expect(firstRoot.querySelector("[data-md-table-scroll-track='true']")).not.toBeNull();
    expect(firstRoot.querySelector("[data-md-table-surface='true']")).not.toBeNull();
    expect(firstRoot.querySelector("[data-md-table-scrollbar-rail='true']")).not.toBeNull();
    mockHorizontalScroller(firstViewport, 240, 720);
    firstViewport.scrollLeft = 180;
    firstViewport.dispatchEvent(new Event("scroll"));
    await nextAnimationFrame();

    view.dom.querySelector<HTMLButtonElement>(".cm-md-table-add-column")?.click();
    await nextAnimationFrame();

    const replacementRoot = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    expect(replacementRoot).not.toBe(firstRoot);
    expect(replacementRoot.dataset.mdInlineViewportSession).toBe(firstSessionId);
    expect(replacementRoot.dataset.mdTableColumnLayoutSession).toBe(firstColumnLayoutSessionId);
    expect(Array.from(
      replacementRoot.querySelectorAll<HTMLTableColElement>("colgroup col"),
      (column) => column.style.width,
    ).slice(0, firstColumnWidths.length)).toEqual(firstColumnWidths);

    expect(undo(view)).toBe(true);
    await nextAnimationFrame();
    expect(
      view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")?.dataset.mdInlineViewportSession,
    ).toBe(firstSessionId);
    expect(
      view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")?.dataset.mdTableColumnLayoutSession,
    ).toBe(firstColumnLayoutSessionId);

    expect(redo(view)).toBe(true);
    await nextAnimationFrame();
    expect(
      view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")?.dataset.mdInlineViewportSession,
    ).toBe(firstSessionId);
    expect(
      view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")?.dataset.mdTableColumnLayoutSession,
    ).toBe(firstColumnLayoutSessionId);
  });

  it("syncs a reading-rail scrollbar with the wider table viewport", async () => {
    const view = createTableView();
    const root = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    const viewport = root.querySelector<HTMLElement>(".cm-md-table-scrollport")!;
    const scrollbar = root.querySelector<HTMLElement>(".cm-md-table-scrollbar-rail")!;
    const scrollbarContent = scrollbar.querySelector<HTMLElement>(
      ".cm-md-table-scrollbar-content",
    )!;
    const table = root.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    mockHorizontalScroller(viewport, 500, 1500);
    mockHorizontalScroller(scrollbar, 300, 1300);
    mockRect(root, rect(100, 0, 300, 180));
    mockRect(viewport, rect(40, 0, 900, 160));
    mockRect(scrollbar, rect(100, 160, 300, 12));
    mockRect(table, rect(100, 20, 1400, 120));
    for (const row of Array.from(table.rows)) {
      Array.from(row.cells).forEach((cell, index) => {
        mockRect(cell, rect(100 + index * 100, 20, 100, 32));
      });
    }
    await nextAnimationFrame();

    expect(scrollbar.hidden).toBe(false);
    expect(scrollbarContent.style.inlineSize).toBe("1300px");
    scrollbar.scrollLeft = 420;
    scrollbar.dispatchEvent(new Event("scroll"));
    await nextAnimationFrame();
    expect(viewport.scrollLeft).toBeCloseTo(420, 5);

    viewport.scrollLeft = 730;
    viewport.dispatchEvent(new Event("scroll"));
    await nextAnimationFrame();
    expect(scrollbar.scrollLeft).toBeCloseTo(730, 5);
  });

  it("maps viewport lineage through an unrelated edit before the table", async () => {
    const view = createTableView();
    const firstSessionId = view.dom.querySelector<HTMLElement>(
      ".cm-md-table-widget-wrap",
    )?.dataset.mdInlineViewportSession;

    view.dispatch({ changes: { from: 0, insert: "intro\n" } });
    await vi.waitFor(() => {
      expect(
        view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")?.dataset.mdInlineViewportSession,
      ).toBe(firstSessionId);
    });
  });

  it("keeps viewport lineage when a cell commit replaces the table Widget", async () => {
    const view = createTableView();
    const firstSessionId = view.dom.querySelector<HTMLElement>(
      ".cm-md-table-widget-wrap",
    )?.dataset.mdInlineViewportSession;
    const cell = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="1"][data-md-table-column="1"]',
    )!;
    cell.focus();
    cell.textContent = "updated value";
    cell.dispatchEvent(new InputEvent("input", { bubbles: true }));
    cell.blur();
    await nextAnimationFrame();

    expect(source(view)).toContain("updated value");
    expect(
      view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")?.dataset.mdInlineViewportSession,
    ).toBe(firstSessionId);
  });

  it("does not leak viewport state into an unrelated replacement table", async () => {
    const view = createTableView();
    const firstViewport = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    const firstSessionId = firstViewport.dataset.mdInlineViewportSession;
    const replacement = [
      "| X | Y |",
      "| --- | --- |",
      "| seven | eight |",
    ].join("\n");

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: replacement } });
    await nextAnimationFrame();

    const replacementViewport = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    expect(replacementViewport.dataset.mdInlineViewportSession).toBeTruthy();
    expect(replacementViewport.dataset.mdInlineViewportSession).not.toBe(firstSessionId);
    expect(replacementViewport.dataset.mdInlineViewportAnchor).toBe("start");
  });

  it("reveals the focused column without scrolling the outer editor horizontally", async () => {
    const view = createTableView();
    const root = view.dom.querySelector<HTMLElement>(".cm-md-table-widget-wrap")!;
    const viewport = root.querySelector<HTMLElement>(".cm-md-table-scrollport")!;
    const table = root.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    mockHorizontalScroller(viewport, 250, 500);
    mockRect(viewport, rect(0, 0, 250, 160));
    mockRect(table, rect(80, 20, 300, 120));
    for (const row of Array.from(table.rows)) {
      Array.from(row.cells).forEach((cell, index) => {
        mockRect(cell, rect(80 + index * 100, 20, 100, 32));
      });
    }
    const outerScrollLeft = view.scrollDOM.scrollLeft;

    expect(focusMarkdownTableCell(root, { rowIndex: 0, columnIndex: 2 })).toBe(true);
    await nextAnimationFrame();

    expect(viewport.scrollLeft).toBeGreaterThan(0);
    expect(view.scrollDOM.scrollLeft).toBe(outerScrollLeft);
    expect((document.activeElement as HTMLElement | null)?.dataset.mdTableColumn).toBe("2");
  });

  it("moves a column through the cell context menu", () => {
    const view = createTableView();
    const firstHeader = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="0"][data-md-table-column="0"]',
    );
    firstHeader?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    }));
    const moveRight = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cm-md-table-context-menu button"),
    ).find((button) => button.textContent?.includes("Move column right"));
    expect(moveRight).not.toBeUndefined();
    expect(() => moveRight?.click()).not.toThrow();
    expect(source(view).split("\n")[0]).toMatch(/^\| B\s+\| A\s+\| C\s+\|$/);
  });

  it("carries the resolved editor theme into the document-level table menu", () => {
    const view = createTableView();
    view.dom.style.setProperty("--po-menu-bg", "rgb(17, 19, 23)");
    view.dom.style.setProperty("--po-menu-border", "rgb(47, 51, 59)");
    view.dom.style.setProperty("--po-text", "rgb(241, 245, 249)");
    view.dom.style.setProperty("color-scheme", "dark");
    const firstHeader = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="0"][data-md-table-column="0"]',
    );

    firstHeader?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    }));

    const menu = document.querySelector<HTMLElement>(".cm-md-table-context-menu");
    expect(menu).not.toBeNull();
    expect(menu?.parentElement).toBe(document.body);
    expect(menu?.style.getPropertyValue("--po-menu-bg")).toBe("rgb(17, 19, 23)");
    expect(menu?.style.getPropertyValue("--po-menu-border")).toBe("rgb(47, 51, 59)");
    expect(menu?.style.getPropertyValue("--po-text")).toBe("rgb(241, 245, 249)");
    expect(menu?.style.getPropertyValue("color-scheme")).toBe("dark");
  });

  it("prefers the host's theme-aware overlay root", () => {
    const overlayRoot = document.createElement("div");
    overlayRoot.dataset.poOverlayRoot = "true";
    document.body.appendChild(overlayRoot);
    const view = createTableView();
    const firstHeader = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="0"][data-md-table-column="0"]',
    );

    firstHeader?.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    }));

    expect(document.querySelector(".cm-md-table-context-menu")?.parentElement).toBe(overlayRoot);
  });

  it("provides roving menu focus, typeahead, and Escape focus restoration", () => {
    const view = createTableView();
    const firstBodyCell = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="1"][data-md-table-column="0"]',
    )!;
    firstBodyCell.focus();

    firstBodyCell.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0,
    }));

    const menu = document.querySelector<HTMLElement>(".cm-md-table-context-menu")!;
    expect((document.activeElement as HTMLElement | null)?.textContent).toContain("Insert row above");
    expect(firstBodyCell.dataset.mdTableEditing).toBe("true");

    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    }));
    expect((document.activeElement as HTMLElement | null)?.textContent).toContain("Insert row below");

    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "End",
    }));
    expect((document.activeElement as HTMLElement | null)?.textContent).toContain("Delete table");

    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "d",
    }));
    expect((document.activeElement as HTMLElement | null)?.textContent).toContain("Duplicate row");

    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }));
    expect(menu.isConnected).toBe(false);
    expect(document.activeElement).toBe(firstBodyCell);
    expect(firstBodyCell.dataset.mdTableEditing).toBe("true");
  });

  it("closes on focus exit without leaving an unfocused cell edit session", async () => {
    const view = createTableView();
    const firstBodyCell = view.dom.querySelector<HTMLElement>(
      '.cm-md-table-cell-content[data-md-table-row="1"][data-md-table-column="0"]',
    )!;
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    firstBodyCell.focus();
    firstBodyCell.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 30,
    }));

    outsideButton.focus();
    await Promise.resolve();

    expect(document.querySelector(".cm-md-table-context-menu")).toBeNull();
    expect(document.activeElement).toBe(outsideButton);
    expect(firstBodyCell.dataset.mdTableEditing).toBeUndefined();
  });

  it("highlights a handle's source column from pointer-down until its menu closes", () => {
    const view = createTableView();
    const table = view.dom.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    const sourceCells = Array.from(table.rows).map((row) => row.cells[1]!);

    headers[1]?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const handle = view.dom.querySelector<HTMLElement>(".cm-md-table-column-handle")!;
    makeHandleCaptureSafe(handle);
    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 21,
    }));

    expect(sourceCells.every((cell) => cell.classList.contains("cm-md-table-drag-source"))).toBe(true);

    handle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      pointerId: 21,
    }));

    expect(document.querySelector(".cm-md-table-context-menu")).not.toBeNull();
    expect(handle.classList.contains("is-menu-active")).toBe(true);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(handle.getAttribute("aria-controls")).toBe(
      document.querySelector<HTMLElement>(".cm-md-table-context-menu")?.id,
    );
    expect(sourceCells.every((cell) => cell.classList.contains("cm-md-table-drag-source"))).toBe(true);
    const defaultAlignment = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cm-md-table-context-menu button"),
    ).find((button) => button.textContent?.includes("Default alignment"));
    const alignLeft = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cm-md-table-context-menu button"),
    ).find((button) => button.textContent?.includes("Align left"));
    expect(defaultAlignment?.getAttribute("role")).toBe("menuitemradio");
    expect(defaultAlignment?.getAttribute("aria-checked")).toBe("true");
    expect(alignLeft?.getAttribute("aria-checked")).toBe("false");
    expect(Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cm-md-table-context-menu button"),
    ).some((button) => button.textContent?.includes("Auto fit column"))).toBe(true);
    expect(Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cm-md-table-context-menu button"),
    ).some((button) => button.textContent?.includes("Fit columns to viewport"))).toBe(true);
    expect(Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cm-md-table-context-menu button"),
    ).some((button) => button.textContent?.includes("Reset column widths"))).toBe(true);

    closeActiveMarkdownTableMenu();
    expect(handle.classList.contains("is-menu-active")).toBe(false);
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(handle.hasAttribute("aria-controls")).toBe(false);
    expect(sourceCells.some((cell) => cell.classList.contains("cm-md-table-drag-source"))).toBe(false);
  });

  it("moves a column with the pointer drag handle", () => {
    const view = createTableView();
    const surface = view.dom.querySelector<HTMLElement>(".cm-md-table-surface")!;
    const table = view.dom.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    mockRect(surface, rect(0, 0, 300, 140));
    mockRect(table, rect(0, 20, 300, 110));
    headers.forEach((header, index) => mockRect(header, rect(index * 100, 20, 100, 30)));

    headers[0]?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const handle = view.dom.querySelector<HTMLElement>(".cm-md-table-column-handle")!;
    expect(handle.querySelector(".cm-md-table-drag-handle-visual")).not.toBeNull();
    makeHandleCaptureSafe(handle);
    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 50,
      clientY: 10,
      pointerId: 11,
    }));
    handle.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientX: 280,
      clientY: 10,
      pointerId: 11,
    }));
    expect(() => handle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      clientX: 280,
      clientY: 10,
      pointerId: 11,
    }))).not.toThrow();

    expect(source(view).split("\n")[0]).toMatch(/^\| B\s+\| C\s+\| A\s+\|$/);
  });

  it("moves a body row with the pointer drag handle", () => {
    const view = createTableView();
    const surface = view.dom.querySelector<HTMLElement>(".cm-md-table-surface")!;
    const table = view.dom.querySelector<HTMLTableElement>(".cm-md-table-widget")!;
    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    mockRect(surface, rect(0, 0, 300, 140));
    mockRect(table, rect(0, 20, 300, 110));
    bodyRows.forEach((row, index) => mockRect(row, rect(0, 50 + index * 30, 300, 30)));

    bodyRows[0]?.cells[0]?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const handle = view.dom.querySelector<HTMLElement>(".cm-md-table-row-handle")!;
    makeHandleCaptureSafe(handle);
    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      clientX: 0,
      clientY: 65,
      pointerId: 12,
    }));
    expect(Array.from(bodyRows[0]!.cells).every((cell) => (
      cell.classList.contains("cm-md-table-drag-source")
    ))).toBe(true);
    handle.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      clientX: 0,
      clientY: 110,
      pointerId: 12,
    }));
    expect(() => handle.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      clientX: 0,
      clientY: 110,
      pointerId: 12,
    }))).not.toThrow();

    expect(source(view).split("\n")[2]).toMatch(/^\| four\s+\| five\s+\| six\s+\|$/);
    expect(source(view).split("\n")[3]).toMatch(/^\| one\s+\| two\s+\| three\s+\|$/);
  });
});

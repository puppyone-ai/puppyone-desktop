/**
 * @vitest-environment happy-dom
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markdownCodeMirrorBaseExtensions,
  markdownLivePreviewExtension,
} from "../packages/shared-ui/src/editor/markdown/markdownCodeMirrorExtensions";
import { closeActiveMarkdownTableMenu } from "../packages/shared-ui/src/editor/markdown/features/table/tableMenuState";

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
  vi.restoreAllMocks();
});

function createTableView() {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: TABLE_SOURCE,
      extensions: [
        ...markdownCodeMirrorBaseExtensions(false),
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

describe("Markdown table EditorView interactions", () => {
  it("adds rows and columns and restores logical focus after the view update", async () => {
    const view = createTableView();
    const addRow = view.dom.querySelector<HTMLButtonElement>(".cm-md-table-add-row");
    expect(addRow).not.toBeNull();
    expect(addRow?.querySelector(".cm-md-table-structure-button-visual")?.textContent).toBe("+");
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

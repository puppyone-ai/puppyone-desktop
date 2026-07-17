import { EditorView, WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownLinkGraph } from "../../../viewerTypes";
import { getMarkdownEmbedHost } from "../../platform/codemirror/embedHost";
import { disposeWidgetSessionDom } from "../../platform/codemirror/widgetSession";
import type { MarkdownTableAlignment, MarkdownTableRow } from "./tableModel";
import { MarkdownWidgetMeasureController } from "../../platform/codemirror/layoutCoordinator";
import {
  createMarkdownTableRenderKey,
  estimateMarkdownTableColumnWidths,
  estimateMarkdownTableLayoutHeight,
} from "./tableLayout";
import { createTableCellEditor, disposeTableCellEditor } from "./tableCellEditor";
import { dispatchMarkdownTableStructureOperation, getActiveMarkdownTableCellDraft } from "./tableCommands";
import { createMarkdownTableDragLayer } from "./tableDragLayer";
import { getMarkdownLocalization } from "../../core/editor/markdownLocalization";
import {
  MARKDOWN_RICH_BLOCK_EXECUTION,
  type MarkdownMountedBlockExecution,
} from "../../core/plans/markdownBlockExecution";
import { createMarkdownTableWindowController } from "./tableWindowController";
import type { MarkdownInlinePreviewRenderer } from "../../shared/preview/markdownInlinePreviewPort";

export class MarkdownTableWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly alignments: MarkdownTableAlignment[],
    private readonly rows: MarkdownTableRow[],
    private readonly markdownLinkGraph: MarkdownLinkGraph | null,
    private readonly documentPath: string,
    private readonly _markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
    private readonly renderInlinePreview: MarkdownInlinePreviewRenderer,
    private readonly layoutEstimatedHeight = estimateMarkdownTableLayoutHeight(rows),
    private readonly renderKey = createMarkdownTableRenderKey(alignments, rows),
    private readonly execution: MarkdownMountedBlockExecution = MARKDOWN_RICH_BLOCK_EXECUTION,
  ) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return (
      widget instanceof MarkdownTableWidget &&
      widget.from === this.from &&
      widget.to === this.to &&
      widget.renderKey === this.renderKey &&
      widget.layoutEstimatedHeight === this.layoutEstimatedHeight &&
      markdownTableExecutionsEqual(widget.execution, this.execution) &&
      widget.markdownLinkGraph === this.markdownLinkGraph &&
      widget.documentPath === this.documentPath &&
      widget._markdownAssetUrlResolver === this._markdownAssetUrlResolver &&
      widget.renderInlinePreview === this.renderInlinePreview
    );
  }

  get estimatedHeight(): number {
    return this.layoutEstimatedHeight;
  }

  toDOM(view: EditorView): HTMLElement {
    const localization = getMarkdownLocalization(view);
    const doc = view.dom.ownerDocument;
    const host = getMarkdownEmbedHost(view, {
      resolveAssetUrl: this._markdownAssetUrlResolver,
    });
    const wrapper = doc.createElement("div");
    wrapper.dir = localization.direction;
    wrapper.className = view.state.readOnly ? "cm-md-table-widget-wrap is-readonly" : "cm-md-table-widget-wrap";
    wrapper.dataset.mdTableFrom = String(this.from);
    wrapper.dataset.mdTableExecution = this.execution.mode;
    const rowCount = this.rows.length;
    // The semantic table model normalizes every row to the alignment width.
    // Do not rescan an oversized immutable row collection during DOM mount.
    const columnCount = Math.max(1, this.alignments.length);

    const frame = doc.createElement("div");
    frame.className = "cm-md-table-frame";
    const surface = doc.createElement("div");
    surface.className = "cm-md-table-surface";

    const table = doc.createElement("table");
    table.className = "cm-md-table-widget";
    table.dir = "auto";
    table.setAttribute("aria-rowcount", String(rowCount));
    table.setAttribute("aria-colcount", String(columnCount));

    if (this.execution.mode === "windowed") {
      table.classList.add("is-windowed");
      const colgroup = doc.createElement("colgroup");
      for (const width of estimateMarkdownTableColumnWidths(this.alignments, this.rows)) {
        const column = doc.createElement("col");
        column.style.width = `${width}px`;
        colgroup.appendChild(column);
      }
      table.appendChild(colgroup);
    }

    const createRow = (row: MarkdownTableRow, rowIndex: number, header: boolean) => {
      const tr = doc.createElement("tr");
      tr.dataset.mdTableRow = String(rowIndex);
      tr.setAttribute("aria-rowindex", String(rowIndex + 1));
      for (const [columnIndex, cell] of row.cells.entries()) {
        const tableCell = doc.createElement(header ? "th" : "td");
        tableCell.setAttribute("aria-colindex", String(columnIndex + 1));
        applyTableCellAlignment(tableCell, this.alignments[columnIndex] ?? null);
        tableCell.appendChild(createTableCellEditor({
          alignments: this.alignments,
          cell,
          columnCount,
          columnIndex,
          documentPath: this.documentPath,
          markdownLinkGraph: this.markdownLinkGraph,
          rowCount,
          rowIndex,
          rows: this.rows,
          renderInlinePreview: this.renderInlinePreview,
          tableFrom: this.from,
          tableTo: this.to,
          view,
        }));
        tr.appendChild(tableCell);
      }
      return tr;
    };

    const disposeRow = (row: HTMLTableRowElement) => {
      for (const cell of row.querySelectorAll<HTMLElement>(".cm-md-table-cell-content")) {
        disposeTableCellEditor(cell);
      }
    };

    const header = this.rows[0]?.header ? this.rows[0] : null;
    if (header) {
      const thead = doc.createElement("thead");
      thead.appendChild(createRow(header, 0, true));
      table.appendChild(thead);
    }

    const globalRowOffset = header ? 1 : 0;
    const bodyRowCount = Math.max(0, this.rows.length - globalRowOffset);
    const getBodyRow = (bodyIndex: number) => this.rows[bodyIndex + globalRowOffset];
    let windowController: ReturnType<typeof createMarkdownTableWindowController> | null = null;
    if (bodyRowCount > 0) {
      const tbody = doc.createElement("tbody");
      if (this.execution.mode === "windowed") {
        windowController = createMarkdownTableWindowController({
          bodyRowCount,
          columnCount,
          createRow: (bodyIndex) => createRow(
            getBodyRow(bodyIndex),
            bodyIndex + globalRowOffset,
            false,
          ),
          disposeRow,
          getBodyRow,
          globalRowOffset,
          host,
          overscan: this.execution.overscanItems,
          table,
          tbody,
          view,
          wrapper,
        });
      } else {
        for (let bodyRowIndex = 0; bodyRowIndex < bodyRowCount; bodyRowIndex += 1) {
          tbody.appendChild(createRow(
            getBodyRow(bodyRowIndex),
            bodyRowIndex + globalRowOffset,
            false,
          ));
        }
      }
      table.appendChild(tbody);
    }

    surface.appendChild(table);
    if (!view.state.readOnly) {
      surface.appendChild(createTableStructureButton({
        className: "cm-md-table-add-row",
        label: localization.t("editor.markdown.table.addRow"),
        onActivate: () => {
          dispatchMarkdownTableStructureOperation({
            alignments: this.alignments,
            currentDraft: getActiveMarkdownTableCellDraft(wrapper),
            rows: this.rows,
            tableFrom: this.from,
            tableTo: this.to,
            view,
          }, {
            type: "insert-row-below",
            rowIndex: Math.max(0, rowCount - 1),
            columnIndex: 0,
          });
        },
      }));
      surface.appendChild(createTableStructureButton({
        className: "cm-md-table-add-column",
        label: localization.t("editor.markdown.table.addColumn"),
        onActivate: () => {
          dispatchMarkdownTableStructureOperation({
            alignments: this.alignments,
            currentDraft: getActiveMarkdownTableCellDraft(wrapper),
            rows: this.rows,
            tableFrom: this.from,
            tableTo: this.to,
            view,
          }, {
            type: "insert-column-right",
            rowIndex: 0,
            columnIndex: Math.max(0, columnCount - 1),
          });
        },
      }));
    }
    const dragLayer = createMarkdownTableDragLayer({
      alignments: this.alignments,
      columnCount,
      rows: this.rows,
      table,
      tableFrom: this.from,
      tableTo: this.to,
      view,
      wrapper,
    });
    surface.appendChild(dragLayer.element);
    frame.appendChild(surface);
    wrapper.appendChild(frame);

    const measure = new MarkdownWidgetMeasureController(host.layout);
    measure.observe(wrapper);

    host.sessions.mount(wrapper, () => ({
      dispose() {
        dragLayer.dispose();
        windowController?.dispose();
        for (const cell of wrapper.querySelectorAll<HTMLElement>(".cm-md-table-cell-content")) {
          disposeTableCellEditor(cell);
        }
        measure.destroy();
      },
    }));

    if (!view.state.readOnly) {
      // Clicks on cell padding land on td/th (the contenteditable often does
      // not fill the full row height). Route those to the cell editor — never
      // to whole-table selection. Block select stays for document sweeps /
      // drag-handle menus, not for in-cell clicks.
      table.addEventListener("mousedown", (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".cm-md-table-cell-content")) return;
        const cell = target.closest("td, th");
        if (!(cell instanceof HTMLTableCellElement) || !table.contains(cell)) return;
        const editor = cell.querySelector<HTMLElement>(".cm-md-table-cell-content[contenteditable='true']");
        if (!editor) return;
        event.preventDefault();
        event.stopPropagation();
        editor.focus();
      });
    }

    return wrapper;
  }

  destroy(dom: HTMLElement) {
    disposeWidgetSessionDom(dom);
  }

  ignoreEvent() {
    return true;
  }
}

function applyTableCellAlignment(element: HTMLElement, alignment: MarkdownTableAlignment) {
  element.classList.toggle("cm-md-table-align-left", alignment === "left");
  element.classList.toggle("cm-md-table-align-center", alignment === "center");
  element.classList.toggle("cm-md-table-align-right", alignment === "right");
  if (alignment) {
    element.style.textAlign = alignment;
  } else {
    element.style.removeProperty("text-align");
  }
}

function createTableStructureButton({
  className,
  label,
  onActivate,
}: {
  className: string;
  label: string;
  onActivate: () => void;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `cm-md-table-structure-button ${className}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  const visual = document.createElement("span");
  visual.className = "cm-md-table-structure-button-visual";
  visual.setAttribute("aria-hidden", "true");
  visual.textContent = "+";
  button.appendChild(visual);
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  });
  return button;
}

function markdownTableExecutionsEqual(
  left: MarkdownMountedBlockExecution,
  right: MarkdownMountedBlockExecution,
): boolean {
  return (
    left.mode === right.mode
    && left.budgetVersion === right.budgetVersion
    && (left.mode !== "windowed" || (
      right.mode === "windowed"
      && left.overscanItems === right.overscanItems
    ))
  );
}

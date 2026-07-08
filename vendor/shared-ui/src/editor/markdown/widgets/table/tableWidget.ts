import { EditorView, WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownLinkGraph } from "../../../viewerTypes";
import type { MarkdownTableAlignment, MarkdownTableRow } from "../../rendering/tableModel";
import { estimateMarkdownTableWidgetHeight, MarkdownWidgetMeasureController } from "../markdownWidgetMeasure";
import { createTableCellEditor } from "./tableCellEditor";
import { dispatchMarkdownTableStructureOperation, getActiveMarkdownTableCellDraft } from "./tableDispatch";
import { createMarkdownTableDragLayer } from "./tableDragLayer";
import { restorePendingMarkdownTableFocus } from "./tableFocus";

export class MarkdownTableWidget extends WidgetType {
  private readonly measure = new MarkdownWidgetMeasureController();

  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly alignments: MarkdownTableAlignment[],
    private readonly rows: MarkdownTableRow[],
    private readonly markdownLinkGraph: MarkdownLinkGraph | null,
    private readonly documentPath: string,
    private readonly markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  ) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return (
      widget instanceof MarkdownTableWidget &&
      widget.from === this.from &&
      widget.to === this.to &&
      JSON.stringify(widget.alignments) === JSON.stringify(this.alignments) &&
      JSON.stringify(widget.rows) === JSON.stringify(this.rows) &&
      widget.markdownLinkGraph === this.markdownLinkGraph &&
      widget.documentPath === this.documentPath &&
      widget.markdownAssetUrlResolver === this.markdownAssetUrlResolver
    );
  }

  get estimatedHeight(): number {
    return estimateMarkdownTableWidgetHeight(this.rows.length);
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = view.state.readOnly ? "cm-md-table-widget-wrap is-readonly" : "cm-md-table-widget-wrap";
    const rowCount = this.rows.length;
    const columnCount = Math.max(1, this.alignments.length, ...this.rows.map((row) => row.cells.length));

    const frame = document.createElement("div");
    frame.className = "cm-md-table-frame";
    const surface = document.createElement("div");
    surface.className = "cm-md-table-surface";

    const table = document.createElement("table");
    table.className = "cm-md-table-widget";

    const header = this.rows.find((row) => row.header);
    if (header) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const [columnIndex, cell] of header.cells.entries()) {
        const th = document.createElement("th");
        applyTableCellAlignment(th, this.alignments[columnIndex] ?? null);
        th.appendChild(createTableCellEditor({
          alignments: this.alignments,
          cell,
          columnCount,
          columnIndex,
          documentPath: this.documentPath,
          markdownAssetUrlResolver: this.markdownAssetUrlResolver,
          markdownLinkGraph: this.markdownLinkGraph,
          rowCount,
          rowIndex: 0,
          rows: this.rows,
          tableFrom: this.from,
          tableTo: this.to,
          view,
        }));
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }

    const bodyRows = this.rows.filter((row) => !row.header);
    if (bodyRows.length > 0) {
      const tbody = document.createElement("tbody");
      for (const [bodyRowIndex, row] of bodyRows.entries()) {
        const rowIndex = bodyRowIndex + (header ? 1 : 0);
        const tr = document.createElement("tr");
        for (const [columnIndex, cell] of row.cells.entries()) {
          const td = document.createElement("td");
          applyTableCellAlignment(td, this.alignments[columnIndex] ?? null);
          td.appendChild(createTableCellEditor({
            alignments: this.alignments,
            cell,
            columnCount,
            columnIndex,
            documentPath: this.documentPath,
            markdownAssetUrlResolver: this.markdownAssetUrlResolver,
            markdownLinkGraph: this.markdownLinkGraph,
            rowCount,
            rowIndex,
            rows: this.rows,
            tableFrom: this.from,
            tableTo: this.to,
            view,
          }));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }

    surface.appendChild(table);
    if (!view.state.readOnly) {
      surface.appendChild(createTableStructureButton({
        className: "cm-md-table-add-row",
        label: "Add row",
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
        label: "Add column",
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
    surface.appendChild(createMarkdownTableDragLayer({
      alignments: this.alignments,
      columnCount,
      rows: this.rows,
      table,
      tableFrom: this.from,
      tableTo: this.to,
      view,
      wrapper,
    }));
    frame.appendChild(surface);
    wrapper.appendChild(frame);
    this.measure.observe(wrapper, view);
    restorePendingMarkdownTableFocus(wrapper, view, this.from);

    return wrapper;
  }

  destroy() {
    this.measure.destroy();
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
  button.textContent = "+";
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

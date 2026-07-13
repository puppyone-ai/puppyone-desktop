import { EditorView, WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownLinkGraph } from "../../../viewerTypes";
import { getMarkdownEmbedHost } from "../../platform/codemirror/embedHost";
import { disposeWidgetSessionDom } from "../../platform/codemirror/widgetSession";
import type { MarkdownTableAlignment, MarkdownTableRow } from "./tableModel";
import { MarkdownWidgetMeasureController } from "../../platform/codemirror/layoutCoordinator";
import { createMarkdownTableRenderKey, estimateMarkdownTableLayoutHeight } from "./tableLayout";
import { createTableCellEditor, disposeTableCellEditor } from "./tableCellEditor";
import { dispatchMarkdownTableStructureOperation, getActiveMarkdownTableCellDraft } from "./tableCommands";
import { createMarkdownTableDragLayer } from "./tableDragLayer";
import { getMarkdownLocalization } from "../../core/editor/markdownLocalization";

export class MarkdownTableWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly alignments: MarkdownTableAlignment[],
    private readonly rows: MarkdownTableRow[],
    private readonly markdownLinkGraph: MarkdownLinkGraph | null,
    private readonly documentPath: string,
    private readonly _markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
    private readonly layoutEstimatedHeight = estimateMarkdownTableLayoutHeight(rows),
    private readonly renderKey = createMarkdownTableRenderKey(alignments, rows),
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
      widget.markdownLinkGraph === this.markdownLinkGraph &&
      widget.documentPath === this.documentPath &&
      widget._markdownAssetUrlResolver === this._markdownAssetUrlResolver
    );
  }

  get estimatedHeight(): number {
    return this.layoutEstimatedHeight;
  }

  toDOM(view: EditorView): HTMLElement {
    const localization = getMarkdownLocalization(view);
    const host = getMarkdownEmbedHost(view, {
      resolveAssetUrl: this._markdownAssetUrlResolver,
    });
    const wrapper = document.createElement("div");
    wrapper.dir = localization.direction;
    wrapper.className = view.state.readOnly ? "cm-md-table-widget-wrap is-readonly" : "cm-md-table-widget-wrap";
    wrapper.dataset.mdTableFrom = String(this.from);
    const rowCount = this.rows.length;
    const columnCount = Math.max(1, this.alignments.length, ...this.rows.map((row) => row.cells.length));

    const frame = document.createElement("div");
    frame.className = "cm-md-table-frame";
    const surface = document.createElement("div");
    surface.className = "cm-md-table-surface";

    const table = document.createElement("table");
    table.className = "cm-md-table-widget";
    table.dir = "auto";

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

import { EditorSelection } from "@codemirror/state";
import { EditorView, type Rect, WidgetType } from "@codemirror/view";
import type { MarkdownTaskLine } from "../rendering/taskModel";
import { getInlineWidgetEdgeX, getInlineWidgetTextCoords } from "./markdownWidgetMeasure";
import { hasPointerMoved } from "./widgetDom";

export type MarkdownSourceSyntaxKind =
  | "blockquote"
  | "delimiter"
  | "escape"
  | "heading"
  | "inline-html"
  | "link"
  | "list"
  | "task"
  | "wiki-link";

export class HiddenMarkdownSyntaxWidget extends WidgetType {
  constructor(private readonly kind: MarkdownSourceSyntaxKind) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return widget instanceof HiddenMarkdownSyntaxWidget && widget.kind === this.kind;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = `cm-md-hidden-syntax cm-md-hidden-syntax-${this.kind}`;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  ignoreEvent() {
    return true;
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return getInlineWidgetTextCoords(dom, getInlineWidgetEdgeX(dom, pos, side));
  }
}

export class InlineHtmlLineBreakWidget extends WidgetType {
  eq(widget: WidgetType): boolean {
    return widget instanceof InlineHtmlLineBreakWidget;
  }

  toDOM(): HTMLElement {
    const lineBreak = document.createElement("br");
    lineBreak.className = "cm-md-inline-html-break";
    lineBreak.setAttribute("aria-hidden", "true");
    return lineBreak;
  }

  ignoreEvent() {
    return true;
  }
}

export class TaskCheckboxWidget extends WidgetType {
  private pointerDown: { x: number; y: number } | null = null;

  constructor(private readonly task: MarkdownTaskLine) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return (
      widget instanceof TaskCheckboxWidget &&
      widget.task.checked === this.task.checked &&
      widget.task.depth === this.task.depth &&
      widget.task.checkboxFrom === this.task.checkboxFrom &&
      widget.task.checkboxTo === this.task.checkboxTo
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-task-checkbox-widget";
    wrapper.style.setProperty("--md-list-depth", String(this.task.depth));

    const checkbox = document.createElement("span");
    checkbox.role = "checkbox";
    checkbox.className = this.task.checked ? "cm-md-task-checkbox is-checked" : "cm-md-task-checkbox";
    checkbox.setAttribute("aria-label", this.task.checked ? "Mark task incomplete" : "Mark task complete");
    checkbox.setAttribute("aria-checked", String(this.task.checked));

    checkbox.addEventListener("mousedown", (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });

    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.pointerDown && hasPointerMoved(event, this.pointerDown)) return;
      if (view.state.readOnly) return;

      const nextValue = this.task.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: { from: this.task.checkboxFrom, to: this.task.checkboxTo, insert: nextValue },
        selection: EditorSelection.cursor(this.task.checkboxFrom + nextValue.length),
      });
      view.focus();
    });

    wrapper.appendChild(checkbox);
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }

  coordsAt(dom: HTMLElement): Rect | null {
    const line = dom.closest(".cm-line");
    const lineRect = line?.getBoundingClientRect();
    if (!line || !lineRect) return null;

    const lineStyle = window.getComputedStyle(line);
    const textLeft = lineRect.left + Number.parseFloat(lineStyle.paddingLeft || "0");
    return getInlineWidgetTextCoords(dom, textLeft);
  }
}

export class HorizontalRuleWidget extends WidgetType {
  eq(widget: WidgetType): boolean {
    return widget instanceof HorizontalRuleWidget;
  }

  get estimatedHeight(): number {
    return 24;
  }

  toDOM(): HTMLElement {
    const rule = document.createElement("span");
    rule.className = "cm-md-hr-widget";
    return rule;
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return getInlineWidgetTextCoords(dom, getInlineWidgetEdgeX(dom, pos, side));
  }
}

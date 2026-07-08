import { EditorSelection } from "@codemirror/state";
import { EditorView, type Rect, WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver } from "../../viewerTypes";
import { isSafeMarkdownImageUrl } from "../links/markdownImageModel";
import { markdownExpandedImageEffect } from "../state/expandedImage";
import {
  getInlineWidgetEdgeX,
  getInlineWidgetTextCoords,
  MarkdownWidgetMeasureController,
} from "./markdownWidgetMeasure";
import { hasPointerMoved } from "./widgetDom";

export class ImagePreviewWidget extends WidgetType {
  private readonly measure = new MarkdownWidgetMeasureController();
  private pointerDown: { x: number; y: number } | null = null;

  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly alt: string,
    private readonly source: string,
    private readonly title: string | null,
    private readonly documentPath: string,
    private readonly markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  ) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return (
      widget instanceof ImagePreviewWidget &&
      widget.from === this.from &&
      widget.to === this.to &&
      widget.alt === this.alt &&
      widget.source === this.source &&
      widget.title === this.title &&
      widget.documentPath === this.documentPath &&
      widget.markdownAssetUrlResolver === this.markdownAssetUrlResolver
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image-widget";
    wrapper.title = this.title ?? this.source;
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute("aria-label", this.alt || this.source);
    wrapper.addEventListener("mousedown", (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    wrapper.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.pointerDown && hasPointerMoved(event, this.pointerDown)) return;

      const selection = view.state.selection.main;
      const alreadySelected = selection.from === this.from && selection.to === this.to;
      view.dispatch(
        alreadySelected
          ? {
              effects: markdownExpandedImageEffect.of({ from: this.from, to: this.to }),
              selection: EditorSelection.cursor(this.from + 2),
            }
          : {
              selection: EditorSelection.range(this.from, this.to),
              effects: markdownExpandedImageEffect.of(null),
            },
      );
      view.focus();
    });

    const directSource = this.source.trim();
    if (isSafeMarkdownImageUrl(directSource)) {
      wrapper.appendChild(this.createImage(directSource, view));
      this.measure.observe(wrapper, view);
      return wrapper;
    }

    if (!this.markdownAssetUrlResolver) {
      wrapper.appendChild(this.createPlaceholder(this.alt || this.source));
      this.measure.observe(wrapper, view);
      return wrapper;
    }

    wrapper.appendChild(this.createPlaceholder("Loading image..."));
    this.measure.observe(wrapper, view);

    Promise.resolve(this.markdownAssetUrlResolver(this.documentPath, this.source))
      .then((resolvedUrl) => {
        if (!wrapper.isConnected) return;
        wrapper.replaceChildren(
          resolvedUrl && isSafeMarkdownImageUrl(resolvedUrl)
            ? this.createImage(resolvedUrl, view)
            : this.createPlaceholder(this.alt || this.source),
        );
        this.measure.schedule(view);
      })
      .catch(() => {
        if (!wrapper.isConnected) return;
        wrapper.replaceChildren(this.createPlaceholder(this.alt || this.source));
        this.measure.schedule(view);
      });

    return wrapper;
  }

  destroy() {
    this.measure.destroy();
  }

  ignoreEvent() {
    return false;
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return getInlineWidgetTextCoords(dom, getInlineWidgetEdgeX(dom, pos, side));
  }

  private createImage(source: string, view: EditorView): HTMLImageElement {
    const image = document.createElement("img");
    image.src = source;
    image.alt = this.alt;
    image.loading = "lazy";
    if (this.title) image.title = this.title;
    image.addEventListener("load", () => this.measure.schedule(view));
    image.addEventListener("error", () => this.measure.schedule(view));
    return image;
  }

  private createPlaceholder(labelText: string): HTMLElement {
    const label = document.createElement("span");
    label.className = "cm-md-image-placeholder";
    label.textContent = labelText;
    return label;
  }
}

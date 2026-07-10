import { EditorSelection } from "@codemirror/state";
import { EditorView, type Rect, WidgetType } from "@codemirror/view";
import { getMarkdownEmbedHost } from "../adapters/codemirror/embedHost";
import { disposeWidgetSessionDom } from "../adapters/codemirror/widgetSession";
import { createCapabilityPrincipal } from "../services/capabilityPrincipal";
import { isSafeMarkdownImageUrl } from "../links/markdownImageModel";
import { markdownDocumentPathFacet, markdownAssetUrlResolverFacet } from "../markdownLivePreviewContext";
import { markdownExpandedImageEffect } from "../state/expandedImage";
import {
  getInlineWidgetEdgeX,
  getInlineWidgetTextCoords,
  MarkdownWidgetMeasureController,
} from "./markdownWidgetMeasure";
import { hasPointerMoved } from "./widgetDom";

/**
 * Immutable image atom descriptor. Asset resolution, measure, and listeners
 * belong to the mounted DOM session.
 */
export class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly alt: string,
    private readonly source: string,
    private readonly title: string | null,
    private readonly documentPath: string,
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
      widget.documentPath === this.documentPath
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const host = getMarkdownEmbedHost(view, {
      resolveAssetUrl: view.state.facet(markdownAssetUrlResolverFacet),
    });
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image-widget";
    wrapper.title = this.title ?? this.source;
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "img");
    wrapper.setAttribute("aria-label", this.alt || this.source);

    const measure = new MarkdownWidgetMeasureController();
    const abort = new AbortController();
    let pointerDown: { x: number; y: number } | null = null;

    const onMouseDown = (event: MouseEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (pointerDown && hasPointerMoved(event, pointerDown)) return;

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
    };

    wrapper.addEventListener("mousedown", onMouseDown);
    wrapper.addEventListener("click", onClick);

    const createImage = (source: string) => {
      const image = document.createElement("img");
      image.src = source;
      image.alt = this.alt;
      image.loading = "lazy";
      if (this.title) image.title = this.title;
      image.addEventListener("load", () => measure.schedule(view));
      image.addEventListener("error", () => measure.schedule(view));
      return image;
    };
    const createPlaceholder = (labelText: string) => {
      const label = document.createElement("span");
      label.className = "cm-md-image-placeholder";
      label.textContent = labelText;
      return label;
    };

    const directSource = this.source.trim();
    if (isSafeMarkdownImageUrl(directSource)) {
      wrapper.appendChild(createImage(directSource));
    } else {
      wrapper.appendChild(createPlaceholder("Loading image..."));
      const documentPath = this.documentPath || view.state.facet(markdownDocumentPathFacet);
      void host.assets
        .resolve({
          principal: createCapabilityPrincipal({
            editorViewId: host.viewId,
            workspaceId: "workspace",
            documentPath,
            documentRevision: String(view.state.doc.length),
            purpose: "asset-read",
          }),
          sourcePath: documentPath,
          href: this.source,
          signal: abort.signal,
        })
        .then((handle) => {
          if (abort.signal.aborted || !wrapper.isConnected) {
            handle?.revoke();
            return;
          }
          wrapper.replaceChildren(
            handle && isSafeMarkdownImageUrl(handle.url)
              ? createImage(handle.url)
              : createPlaceholder(this.alt || this.source),
          );
          measure.schedule(view);
        })
        .catch(() => {
          if (abort.signal.aborted || !wrapper.isConnected) return;
          wrapper.replaceChildren(createPlaceholder(this.alt || this.source));
          measure.schedule(view);
        });
    }

    measure.observe(wrapper, view);
    host.sessions.mount(wrapper, () => ({
      dispose() {
        abort.abort();
        measure.destroy();
        wrapper.removeEventListener("mousedown", onMouseDown);
        wrapper.removeEventListener("click", onClick);
      },
    }));

    return wrapper;
  }

  destroy(dom: HTMLElement) {
    disposeWidgetSessionDom(dom);
  }

  ignoreEvent() {
    return false;
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    return getInlineWidgetTextCoords(dom, getInlineWidgetEdgeX(dom, pos, side));
  }
}

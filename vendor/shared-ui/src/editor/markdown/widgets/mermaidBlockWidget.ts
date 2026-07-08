import { EditorSelection } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { serializeMarkdownCodeBlock } from "../rendering/codeBlockModel";
import {
  createDebouncedMermaidRenderer,
  getMermaidThemeSnapshot,
  subscribeMermaidThemeChanges,
  type MermaidThemeChangeUnsubscribe,
  type MermaidRenderResult,
} from "../rendering/mermaidRenderer";
import { clampNumber, MarkdownWidgetMeasureController } from "./markdownWidgetMeasure";
import { normalizeLineEndings, stopCodeMirrorEvent } from "./widgetDom";

export class MermaidBlockWidget extends WidgetType {
  private readonly measure = new MarkdownWidgetMeasureController();
  private readonly debouncedRenderer = createDebouncedMermaidRenderer();
  private unsubscribeThemeChanges: MermaidThemeChangeUnsubscribe | null = null;

  constructor(
    private readonly code: string,
    private readonly language: string,
    private readonly from: number,
    private readonly to: number,
  ) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return (
      widget instanceof MermaidBlockWidget &&
      widget.code === this.code &&
      widget.language === this.language &&
      widget.from === this.from &&
      widget.to === this.to
    );
  }

  get estimatedHeight(): number {
    const lineCount = Math.max(1, this.code.split("\n").length);
    return clampNumber(120 + lineCount * 18, 180, 1400);
  }

  toDOM(view: EditorView): HTMLElement {
    const shell = document.createElement("div");
    shell.className = "cm-md-mermaid-widget";
    const readOnly = view.state.readOnly;

    let editing = false;
    let committed = false;
    let draftCode = this.code;
    let lastGoodSvg: string | null = null;
    let textarea: HTMLTextAreaElement | null = null;

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-mermaid-toolbar";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "cm-md-mermaid-action";
    toolbar.appendChild(editButton);

    const body = document.createElement("div");
    body.className = "cm-md-mermaid-body";

    const preview = document.createElement("div");
    preview.className = "cm-md-mermaid-preview is-loading";
    const errorStrip = document.createElement("div");
    errorStrip.className = "cm-md-mermaid-error";
    errorStrip.hidden = true;

    const commit = (options: { focus?: boolean } = {}) => {
      if (committed || readOnly) return;
      committed = true;
      const nextCode = normalizeLineEndings(textarea?.value ?? draftCode);
      if (nextCode === this.code) {
        editing = false;
        committed = false;
        renderSurface();
        if (options.focus) view.focus();
        return;
      }

      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert: serializeMarkdownCodeBlock(this.language || "mermaid", nextCode),
        },
      });
      if (options.focus) view.focus();
    };

    const renderPreview = (delayMs: number) => {
      const source = textarea?.value ?? draftCode;
      if (!lastGoodSvg) {
        preview.classList.add("is-loading");
        preview.replaceChildren(createMermaidLoadingElement());
      }

      this.debouncedRenderer.render({
        source,
        theme: getMermaidThemeSnapshot(),
        delayMs,
        onResult(result) {
          lastGoodSvg = result.svg;
          setMermaidPreviewSvg(preview, result);
          errorStrip.hidden = true;
          errorStrip.textContent = "";
          removeMermaidSourceFallback(preview);
          view.requestMeasure();
        },
        onError(error) {
          preview.classList.remove("is-loading");
          showMermaidError(errorStrip, error);
          if (lastGoodSvg) {
            preview.innerHTML = lastGoodSvg;
          } else {
            preview.replaceChildren(createMermaidSourceFallback(source));
          }
          view.requestMeasure();
        },
      });
    };

    const openEditor = () => {
      if (readOnly || editing) return;
      editing = true;
      committed = false;
      draftCode = textarea?.value ?? draftCode;
      renderSurface();
      textarea?.focus();
    };

    const renderSurface = () => {
      shell.replaceChildren();
      body.replaceChildren();

      editButton.textContent = editing ? "Done" : "Edit";
      editButton.setAttribute("aria-label", editing ? "Finish Mermaid editing" : "Edit Mermaid diagram");
      editButton.hidden = readOnly;
      editButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (editing) commit({ focus: true });
        else openEditor();
      };

      if (!readOnly) shell.appendChild(toolbar);

      if (editing) {
        preview.onclick = (event) => {
          event.stopPropagation();
        };
        textarea = document.createElement("textarea");
        textarea.className = "cm-md-mermaid-source";
        textarea.value = draftCode;
        textarea.spellcheck = false;
        textarea.rows = Math.max(4, draftCode.split("\n").length);
        textarea.addEventListener("mousedown", stopCodeMirrorEvent);
        textarea.addEventListener("click", stopCodeMirrorEvent);
        textarea.addEventListener("input", (event) => {
          event.stopPropagation();
          draftCode = textarea?.value ?? draftCode;
          renderPreview(250);
        });
        textarea.addEventListener("keydown", (event) => {
          event.stopPropagation();
          const activeTextarea = textarea;
          if (!activeTextarea) return;
          if (event.key === "ArrowUp" && activeTextarea.selectionStart === 0 && activeTextarea.selectionEnd === 0) {
            event.preventDefault();
            commit();
            view.dispatch({ selection: EditorSelection.cursor(this.from) });
            view.focus();
            return;
          }
          if (
            event.key === "ArrowDown" &&
            activeTextarea.selectionStart === activeTextarea.value.length &&
            activeTextarea.selectionEnd === activeTextarea.value.length
          ) {
            event.preventDefault();
            commit();
            view.dispatch({ selection: EditorSelection.cursor(this.to) });
            view.focus();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            commit({ focus: true });
          }
        });
        textarea.addEventListener("blur", (event) => {
          const nextTarget = event.relatedTarget;
          if (nextTarget instanceof Node && shell.contains(nextTarget)) return;
          commit();
        });

        body.classList.add("is-editing");
        body.append(textarea, preview, errorStrip);
      } else {
        textarea = null;
        body.classList.remove("is-editing");
        preview.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openEditor();
        };
        body.append(preview, errorStrip);
      }

      shell.appendChild(body);
      renderPreview(0);
      this.measure.schedule(view);
    };

    renderSurface();
    this.measure.observe(shell, view);
    this.subscribeThemeChanges(view, () => renderPreview(0));
    return shell;
  }

  destroy() {
    this.debouncedRenderer.cancel();
    this.measure.destroy();
    this.unsubscribeThemeChanges?.();
    this.unsubscribeThemeChanges = null;
  }

  ignoreEvent() {
    return true;
  }

  private subscribeThemeChanges(view: EditorView, render: () => void) {
    this.unsubscribeThemeChanges?.();
    this.unsubscribeThemeChanges = subscribeMermaidThemeChanges(() => {
      render();
      this.measure.schedule(view);
    });
  }
}

function setMermaidPreviewSvg(preview: HTMLElement, result: MermaidRenderResult) {
  preview.classList.remove("is-loading");
  preview.dataset.mermaidCacheKey = result.cacheKey;
  preview.innerHTML = result.svg;
}

function showMermaidError(errorStrip: HTMLElement, error: Error) {
  errorStrip.hidden = false;
  errorStrip.textContent = error.message || "Unable to render Mermaid diagram.";
}

function createMermaidLoadingElement(): HTMLElement {
  const loading = document.createElement("div");
  loading.className = "cm-md-mermaid-loading";
  loading.textContent = "Rendering diagram...";
  return loading;
}

function createMermaidSourceFallback(source: string): HTMLElement {
  const fallback = document.createElement("pre");
  fallback.className = "cm-md-mermaid-source-fallback";
  const code = document.createElement("code");
  code.textContent = source || "Mermaid diagram is empty.";
  fallback.appendChild(code);
  return fallback;
}

function removeMermaidSourceFallback(preview: HTMLElement) {
  preview.querySelector(".cm-md-mermaid-source-fallback")?.remove();
}

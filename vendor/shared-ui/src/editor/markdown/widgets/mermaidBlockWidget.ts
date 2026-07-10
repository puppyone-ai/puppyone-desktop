import { EditorSelection } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { getMarkdownEmbedHost } from "../adapters/codemirror/embedHost";
import { disposeWidgetSessionDom } from "../adapters/codemirror/widgetSession";
import { MARKDOWN_HTML_PROFILE_VERSION } from "../policy/markdownHtmlProfiles";
import { serializeMarkdownCodeBlock } from "../rendering/codeBlockModel";
import {
  getMermaidThemeSnapshot,
  renderMermaidDiagram,
  subscribeMermaidThemeChanges,
  type MermaidRenderResult,
} from "../rendering/mermaidRenderer";
import { createCapabilityPrincipal, workspaceIdForDocument } from "../services/capabilityPrincipal";
import { clampNumber, MarkdownWidgetMeasureController } from "./markdownWidgetMeasure";
import { getDocRevision } from "../services/transactionBroker";
import { markdownDocumentPathFacet } from "../markdownLivePreviewContext";
import { normalizeLineEndings, stopCodeMirrorEvent } from "./widgetDom";

/**
 * Immutable Mermaid descriptor. Debounce, theme subscription, measure, and
 * async render cancellation belong to the DOM session.
 */
export class MermaidBlockWidget extends WidgetType {
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
    const host = getMarkdownEmbedHost(view);
    const shell = document.createElement("div");
    shell.className = "cm-md-mermaid-widget";
    const readOnly = view.state.readOnly;
    const measure = new MarkdownWidgetMeasureController();
    const elementKey = `${this.from}:${this.to}`;
    const elementId = `mermaid:${elementKey}`;
    const baseSource = serializeMarkdownCodeBlock(this.language || "mermaid", this.code);
    const baseRevision = getDocRevision(view.state.doc);

    host.editSessions.set({
      elementId,
      featureId: "mermaid",
      mappedRange: { from: this.from, to: this.to },
      baseSource,
      baseRevision,
      draft: { code: this.code, language: this.language },
      mode: "preview",
    });

    let editing = false;
    let committed = false;
    let draftCode = this.code;
    let lastGoodSvg: string | null = null;
    let textarea: HTMLTextAreaElement | null = null;
    let debounceTimer: number | null = null;
    let renderGeneration = 0;

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

    const clearDebounce = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };

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

      const session = host.editSessions.get(elementId);
      const result = host.transactions.commit(view, {
        mappedRange: session?.mappedRange ?? { from: this.from, to: this.to },
        baseSource,
        baseRevision: session?.baseRevision ?? baseRevision,
        nextSource: serializeMarkdownCodeBlock(this.language || "mermaid", nextCode),
      });
      if (!result.ok) committed = false;
      if (options.focus) view.focus();
    };

    const runRender = (source: string) => {
      const theme = getMermaidThemeSnapshot();
      const generation = ++renderGeneration;
      void host.asyncRender
        .run({
          key: {
            featureId: "mermaid",
            elementKey,
            source,
            themeKey: theme.key,
            policyVersion: MARKDOWN_HTML_PROFILE_VERSION,
            principalKey: host.viewId,
          },
          principal: createCapabilityPrincipal({
            editorViewId: host.viewId,
            workspaceId: workspaceIdForDocument(view.state.facet(markdownDocumentPathFacet) || "mermaid"),
            documentPath: view.state.facet(markdownDocumentPathFacet) || "mermaid",
            documentRevision: baseRevision,
            purpose: "async-render",
          }),
          run: async () => renderMermaidDiagram({ source, theme }),
        })
        .then((result) => {
          if (!result || generation !== renderGeneration || !shell.isConnected) return;
          lastGoodSvg = result.value.svg;
          setMermaidPreviewSvg(preview, result.value);
          errorStrip.hidden = true;
          errorStrip.textContent = "";
          removeMermaidSourceFallback(preview);
          measure.schedule(view);
        })
        .catch((error: unknown) => {
          if (generation !== renderGeneration || !shell.isConnected) return;
          preview.classList.remove("is-loading");
          showMermaidError(errorStrip, error instanceof Error ? error : new Error(String(error)));
          if (lastGoodSvg) preview.innerHTML = lastGoodSvg;
          else preview.replaceChildren(createMermaidSourceFallback(source));
          measure.schedule(view);
        });
    };

    const renderPreview = (delayMs: number) => {
      const source = textarea?.value ?? draftCode;
      if (!lastGoodSvg) {
        preview.classList.add("is-loading");
        preview.replaceChildren(createMermaidLoadingElement());
      }
      clearDebounce();
      if (delayMs <= 0) {
        runRender(source);
        return;
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        runRender(source);
      }, delayMs);
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
            // Commit before reading the mapped-to position; the commit may
            // change document length, making this.to stale.
            const sessionBeforeCommit = host.editSessions.get(elementId);
            const nextCode = normalizeLineEndings(activeTextarea.value);
            const nextSource = serializeMarkdownCodeBlock(this.language || "mermaid", nextCode);
            const commitResult = nextCode !== this.code
              ? host.transactions.commit(view, {
                  mappedRange: sessionBeforeCommit?.mappedRange ?? { from: this.from, to: this.to },
                  baseSource,
                  baseRevision: sessionBeforeCommit?.baseRevision ?? baseRevision,
                  nextSource,
                })
              : { ok: true, mappedTo: sessionBeforeCommit?.mappedRange ?? { from: this.from, to: this.to } };
            committed = commitResult.ok;
            const cursorPos = commitResult.mappedTo?.to
              ?? sessionBeforeCommit?.mappedRange.to
              ?? this.to;
            view.dispatch({ selection: EditorSelection.cursor(cursorPos) });
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
      measure.schedule(view);
    };

    renderSurface();
    measure.observe(shell, view);
    const unsubscribeTheme = subscribeMermaidThemeChanges(() => {
      renderPreview(0);
      measure.schedule(view);
    });

    host.sessions.mount(shell, () => ({
      dispose() {
        clearDebounce();
        renderGeneration += 1;
        measure.destroy();
        unsubscribeTheme();
        host.asyncRender.abort(`mermaid\u0000${elementKey}`);
        host.editSessions.delete(elementId);
      },
    }));

    return shell;
  }

  destroy(dom: HTMLElement) {
    disposeWidgetSessionDom(dom);
  }

  ignoreEvent() {
    return true;
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

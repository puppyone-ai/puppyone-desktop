import { EditorSelection } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { disposeWidgetSessionDom } from "../adapters/codemirror/widgetSession";
import { getMarkdownEmbedHost } from "../adapters/codemirror/embedHost";
import { sanitizeCodeLanguage, serializeMarkdownCodeBlock } from "../rendering/codeBlockModel";
import { estimateCodeBlockWidgetHeight } from "./markdownWidgetMeasure";
import { normalizeLineEndings, stopCodeMirrorEvent } from "./widgetDom";

/**
 * Immutable descriptor. Mounted listeners and draft commit ownership live in
 * the per-view DOM session, not on this WidgetType instance.
 */
export class CodeBlockWidget extends WidgetType {
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
      widget instanceof CodeBlockWidget &&
      widget.code === this.code &&
      widget.language === this.language &&
      widget.from === this.from &&
      widget.to === this.to
    );
  }

  get estimatedHeight(): number {
    return estimateCodeBlockWidgetHeight(this.code);
  }

  toDOM(view: EditorView): HTMLElement {
    const host = getMarkdownEmbedHost(view);
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-code-widget";
    const panel = document.createElement("div");
    panel.className = "cm-md-code-panel";
    const readOnly = view.state.readOnly;
    const baseSource = serializeMarkdownCodeBlock(this.language, this.code);
    const baseRevision = `${this.from}:${this.to}:${baseSource.length}`;
    let committed = false;

    const languageInput = document.createElement("input");
    languageInput.className = "cm-md-code-language";
    if (!this.language) languageInput.classList.add("is-empty");
    languageInput.value = this.language;
    languageInput.placeholder = "language";
    languageInput.readOnly = readOnly;
    languageInput.spellcheck = false;

    const codeEditor = document.createElement("textarea");
    codeEditor.className = "cm-md-code-textarea";
    codeEditor.value = this.code;
    codeEditor.readOnly = readOnly;
    codeEditor.spellcheck = false;
    codeEditor.rows = Math.max(1, this.code.split("\n").length);

    const commit = () => {
      if (committed || readOnly) return;
      committed = true;
      const language = sanitizeCodeLanguage(languageInput.value);
      const code = normalizeLineEndings(codeEditor.value);
      const nextSource = serializeMarkdownCodeBlock(language, code);
      if (language === this.language && code === this.code) {
        committed = false;
        return;
      }

      const ok = host.transactions.commit(view, {
        mappedRange: { from: this.from, to: this.to },
        baseSource,
        baseRevision,
        nextSource,
      });
      if (!ok) {
        // Conflict with external/Agent edit: keep draft visible, allow retry.
        committed = false;
      }
    };

    const onLanguageKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        languageInput.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        languageInput.value = this.language;
        languageInput.blur();
      }
    };
    const onCodeKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "ArrowUp" && codeEditor.selectionStart === 0 && codeEditor.selectionEnd === 0) {
        event.preventDefault();
        commit();
        view.dispatch({ selection: EditorSelection.cursor(this.from) });
        view.focus();
        return;
      }
      if (
        event.key === "ArrowDown" &&
        codeEditor.selectionStart === codeEditor.value.length &&
        codeEditor.selectionEnd === codeEditor.value.length
      ) {
        event.preventDefault();
        commit();
        view.dispatch({ selection: EditorSelection.cursor(this.to) });
        view.focus();
        return;
      }
      if (
        event.key === "Backspace" &&
        !codeEditor.value &&
        codeEditor.selectionStart === 0 &&
        codeEditor.selectionEnd === 0
      ) {
        event.preventDefault();
        committed = true;
        host.transactions.commit(view, {
          mappedRange: { from: this.from, to: this.to },
          baseSource,
          baseRevision,
          nextSource: "",
          selection: { from: this.from, to: this.from },
        });
        view.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        codeEditor.value = this.code;
        codeEditor.blur();
      }
    };

    languageInput.addEventListener("mousedown", stopCodeMirrorEvent);
    languageInput.addEventListener("click", stopCodeMirrorEvent);
    languageInput.addEventListener("keydown", onLanguageKeyDown);
    languageInput.addEventListener("blur", () => {
      if (!readOnly) commit();
    });
    codeEditor.addEventListener("mousedown", stopCodeMirrorEvent);
    codeEditor.addEventListener("click", stopCodeMirrorEvent);
    codeEditor.addEventListener("keydown", onCodeKeyDown);
    codeEditor.addEventListener("blur", () => {
      if (!readOnly) commit();
    });

    panel.append(languageInput, codeEditor);
    wrapper.appendChild(panel);

    host.sessions.mount(wrapper, () => ({
      dispose() {
        languageInput.removeEventListener("keydown", onLanguageKeyDown);
        codeEditor.removeEventListener("keydown", onCodeKeyDown);
      },
    }));

    return wrapper;
  }

  destroy(dom: HTMLElement) {
    disposeWidgetSessionDom(dom);
  }

  ignoreEvent() {
    return true;
  }
}

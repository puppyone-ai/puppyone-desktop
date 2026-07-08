import { EditorSelection } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";
import { sanitizeCodeLanguage, serializeMarkdownCodeBlock } from "../rendering/codeBlockModel";
import { estimateCodeBlockWidgetHeight } from "./markdownWidgetMeasure";
import { normalizeLineEndings, stopCodeMirrorEvent } from "./widgetDom";

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
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-code-widget";
    const panel = document.createElement("div");
    panel.className = "cm-md-code-panel";
    const readOnly = view.state.readOnly;
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      this.commitCodeBlockChange(view, languageInput.value, codeEditor.value);
    };

    const languageInput = document.createElement("input");
    languageInput.className = "cm-md-code-language";
    if (!this.language) languageInput.classList.add("is-empty");
    languageInput.value = this.language;
    languageInput.placeholder = "language";
    languageInput.readOnly = readOnly;
    languageInput.spellcheck = false;
    languageInput.addEventListener("mousedown", stopCodeMirrorEvent);
    languageInput.addEventListener("click", stopCodeMirrorEvent);
    languageInput.addEventListener("keydown", (event) => {
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
    });
    languageInput.addEventListener("blur", () => {
      if (readOnly) return;
      commit();
    });
    panel.appendChild(languageInput);

    const codeEditor = document.createElement("textarea");
    codeEditor.className = "cm-md-code-textarea";
    codeEditor.value = this.code;
    codeEditor.readOnly = readOnly;
    codeEditor.spellcheck = false;
    codeEditor.rows = Math.max(1, this.code.split("\n").length);
    codeEditor.addEventListener("mousedown", stopCodeMirrorEvent);
    codeEditor.addEventListener("click", stopCodeMirrorEvent);
    codeEditor.addEventListener("keydown", (event) => {
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
        view.dispatch({
          changes: { from: this.from, to: this.to, insert: "" },
          selection: EditorSelection.cursor(this.from),
        });
        view.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        codeEditor.value = this.code;
        codeEditor.blur();
      }
    });
    codeEditor.addEventListener("blur", () => {
      if (readOnly) return;
      commit();
    });
    panel.appendChild(codeEditor);
    wrapper.appendChild(panel);

    return wrapper;
  }

  ignoreEvent() {
    return true;
  }

  private commitCodeBlockChange(view: EditorView, nextLanguage: string, nextCode: string) {
    const language = sanitizeCodeLanguage(nextLanguage);
    const code = normalizeLineEndings(nextCode);
    if (language === this.language && code === this.code) return;

    view.dispatch({
      changes: {
        from: this.from,
        to: this.to,
        insert: serializeMarkdownCodeBlock(language, code),
      },
    });
  }
}

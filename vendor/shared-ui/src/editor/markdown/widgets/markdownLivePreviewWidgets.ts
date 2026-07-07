import { EditorSelection } from "@codemirror/state";
import { EditorView, type Rect, WidgetType } from "@codemirror/view";
import { getHtmlPreviewInteractionCss } from "../../htmlPreviewInteraction";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode, MarkdownLinkGraph } from "../../viewerTypes";
import {
  isSafeMarkdownImageUrl,
  resolveMarkdownHtmlImageSources,
} from "../links/markdownImageModel";
import { markdownExpandedImageEffect } from "../markdownLivePreviewState";
import type { MarkdownHtmlBlock } from "../rendering/htmlBlockModel";
import { renderMarkdownInlineInto } from "../rendering/inlineRenderer";
import { createSanitizedBlockHtmlFragment } from "../rendering/sanitizeHtml";
import type { MarkdownTableCell, MarkdownTableRow } from "../rendering/tableModel";
import type { MarkdownTaskLine } from "../rendering/taskModel";
import {
  clampNumber,
  estimateCodeBlockWidgetHeight,
  estimateMarkdownHtmlBlockHeight,
  estimateMarkdownTableWidgetHeight,
  getInlineWidgetEdgeX,
  getInlineWidgetTextCoords,
  MarkdownWidgetMeasureController,
} from "./markdownWidgetMeasure";

export type MarkdownSourceSyntaxKind =
  | "blockquote"
  | "delimiter"
  | "heading"
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

export class HtmlBlockWidget extends WidgetType {
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private readyTimer: number | null = null;
  private readonly measure = new MarkdownWidgetMeasureController();
  private previewVersion = 0;

  constructor(
    private readonly block: MarkdownHtmlBlock,
    private readonly htmlTrustMode: MarkdownHtmlTrustMode,
    private readonly documentPath: string,
    private readonly markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  ) {
    super();
  }

  eq(widget: WidgetType): boolean {
    return (
      widget instanceof HtmlBlockWidget &&
      widget.block.source === this.block.source &&
      widget.block.tagName === this.block.tagName &&
      widget.block.closed === this.block.closed &&
      widget.htmlTrustMode === this.htmlTrustMode &&
      widget.documentPath === this.documentPath &&
      widget.markdownAssetUrlResolver === this.markdownAssetUrlResolver
    );
  }

  get estimatedHeight(): number {
    return estimateMarkdownHtmlBlockHeight(this.block.source);
  }

  toDOM(view: EditorView): HTMLElement {
    const shell = document.createElement("div");
    shell.className = "cm-md-html-widget";

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-html-widget-toolbar";

    const toggleButton = document.createElement("button");
    toggleButton.className = "cm-md-html-source-toggle";
    toggleButton.type = "button";
    toolbar.appendChild(toggleButton);

    const content = document.createElement("div");
    content.className = "cm-md-html-widget-content";

    let showingSource = false;
    const render = () => {
      this.clearPreviewLifecycle();
      const previewVersion = this.nextPreviewVersion();
      content.replaceChildren(
        showingSource ? createHtmlSourceBlock(this.block.source) : this.createPreviewBlock(previewVersion, view),
      );
      toggleButton.replaceChildren(createHtmlWidgetIcon(showingSource ? "preview" : "source"));
      toggleButton.title = showingSource ? "Show HTML preview" : "Show HTML source";
      toggleButton.setAttribute("aria-label", showingSource ? "Show HTML preview" : "Show HTML source");
      toggleButton.classList.toggle("active", showingSource);
      this.measure.schedule(view);
    };

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showingSource = !showingSource;
      render();
    });

    render();
    shell.append(toolbar, content);
    this.measure.observe(shell, view);
    return shell;
  }

  destroy() {
    this.previewVersion += 1;
    this.clearPreviewLifecycle();
    this.measure.destroy();
  }

  ignoreEvent() {
    return true;
  }

  private createPreviewBlock(previewVersion: number, view: EditorView): HTMLElement {
    if (!this.block.closed) {
      return createUnsupportedHtmlBlock(this.block, ["HTML block is not closed"]);
    }

    if (this.htmlTrustMode === "localTrusted") {
      return this.createTrustedHtmlBlock(this.block, previewVersion, view);
    }

    const resolver = this.markdownAssetUrlResolver;
    if (!resolver) {
      return createSanitizedHtmlPreviewBlock(this.block, this.block.source);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-html-rendered-surface cm-md-html-block is-loading";
    wrapper.appendChild(createTrustedHtmlLoader());

    resolveMarkdownHtmlImageSources(this.block.source, this.documentPath, resolver)
      .then((source) => {
        if (!this.isPreviewVersionCurrent(previewVersion)) return;
        replaceWithSanitizedHtmlPreviewBlock(wrapper, this.block, source);
        this.measure.schedule(view);
      })
      .catch(() => {
        if (!this.isPreviewVersionCurrent(previewVersion)) return;
        replaceWithSanitizedHtmlPreviewBlock(wrapper, this.block, this.block.source);
        this.measure.schedule(view);
      });

    return wrapper;
  }

  private clearPreviewLifecycle() {
    if (this.messageListener) {
      window.removeEventListener("message", this.messageListener);
      this.messageListener = null;
    }
    if (this.readyTimer !== null) {
      window.clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  private nextPreviewVersion(): number {
    this.previewVersion += 1;
    return this.previewVersion;
  }

  private isPreviewVersionCurrent(previewVersion: number): boolean {
    return !this.measure.destroyed && this.previewVersion === previewVersion;
  }

  private createTrustedHtmlBlock(block: MarkdownHtmlBlock, previewVersion: number, view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-html-trusted-block is-loading";

    const sizer = createTrustedHtmlSizer(block.source);
    const loader = createTrustedHtmlLoader();
    wrapper.appendChild(sizer);
    wrapper.appendChild(loader);

    const frameId = createTrustedHtmlFrameId();
    const iframe = document.createElement("iframe");
    iframe.className = "cm-md-html-trusted-frame";
    iframe.title = "Trusted Markdown HTML preview";
    iframe.sandbox.add("allow-downloads", "allow-forms", "allow-modals", "allow-popups", "allow-scripts");
    iframe.referrerPolicy = "no-referrer";
    iframe.style.height = `${estimateTrustedHtmlFrameHeight(block.source)}px`;

    const markReady = () => {
      if (this.readyTimer !== null) {
        window.clearTimeout(this.readyTimer);
        this.readyTimer = null;
      }
      if (!wrapper.classList.contains("is-loading")) return;
      wrapper.classList.remove("is-loading");
      sizer.remove();
      loader.remove();
      this.measure.schedule(view);
    };

    let measuredHeight = false;
    this.messageListener = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (!isTrustedHtmlHeightMessage(event.data, frameId)) return;
      measuredHeight = true;
      iframe.style.height = `${clampNumber(event.data.height, 80, 2400)}px`;
      markReady();
      this.measure.schedule(view);
    };
    window.addEventListener("message", this.messageListener);

    iframe.addEventListener("load", () => {
      if (!wrapper.classList.contains("is-loading")) return;
      this.readyTimer = window.setTimeout(() => {
        if (!measuredHeight) markReady();
      }, 120);
    }, { once: true });

    resolveMarkdownHtmlImageSources(block.source, this.documentPath, this.markdownAssetUrlResolver)
      .then((source) => {
        if (!this.isPreviewVersionCurrent(previewVersion)) return;
        iframe.srcdoc = createTrustedHtmlDocument(source, frameId);
        wrapper.appendChild(iframe);
        this.measure.schedule(view);
      })
      .catch(() => {
        if (!this.isPreviewVersionCurrent(previewVersion)) return;
        iframe.srcdoc = createTrustedHtmlDocument(block.source, frameId);
        wrapper.appendChild(iframe);
        this.measure.schedule(view);
      });

    return wrapper;
  }
}

function createHtmlSourceBlock(source: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "cm-md-html-source-block";

  const code = document.createElement("code");
  code.textContent = source;
  pre.appendChild(code);

  return pre;
}

function createSanitizedHtmlPreviewBlock(block: MarkdownHtmlBlock, source: string): HTMLElement {
  const result = createSanitizedBlockHtmlFragment(source);
  if (!result.supported) {
    return createUnsupportedHtmlBlock(block, result.reasons);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "cm-md-html-rendered-surface cm-md-html-block";
  wrapper.appendChild(result.fragment);
  return wrapper;
}

function replaceWithSanitizedHtmlPreviewBlock(target: HTMLElement, block: MarkdownHtmlBlock, source: string) {
  const nextBlock = createSanitizedHtmlPreviewBlock(block, source);
  target.className = nextBlock.className;
  target.replaceChildren(...Array.from(nextBlock.childNodes));
}

function createTrustedHtmlSizer(source: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "cm-md-html-rendered-surface cm-md-html-trusted-sizer";
  wrapper.setAttribute("aria-hidden", "true");

  const result = createSanitizedBlockHtmlFragment(source);
  if (result.fragment.childNodes.length > 0) {
    wrapper.appendChild(result.fragment);
    return wrapper;
  }

  const placeholder = document.createElement("div");
  placeholder.className = "cm-md-html-sizing-placeholder";
  wrapper.appendChild(placeholder);
  return wrapper;
}

function createTrustedHtmlLoader(): HTMLElement {
  const loader = document.createElement("div");
  loader.className = "cm-md-html-trusted-loader";
  loader.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 3; index += 1) {
    const line = document.createElement("span");
    loader.appendChild(line);
  }

  return loader;
}

function createHtmlWidgetIcon(kind: "preview" | "source"): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const paths = kind === "preview"
    ? [
        ["path", "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"],
        ["circle", "M12 12", "3"],
      ] as const
    : [
        ["polyline", "16 18 22 12 16 6"],
        ["polyline", "8 6 2 12 8 18"],
      ] as const;

  for (const item of paths) {
    if (item[0] === "circle") {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", item[2]);
      svg.appendChild(circle);
      continue;
    }

    const element = document.createElementNS("http://www.w3.org/2000/svg", item[0]);
    if (item[0] === "path") element.setAttribute("d", item[1]);
    else element.setAttribute("points", item[1]);
    svg.appendChild(element);
  }

  return svg;
}

function createTrustedHtmlDocument(source: string, frameId: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base target="_blank">
<style>
${getTrustedHtmlThemeCss()}
* {
  box-sizing: border-box;
}
html {
  min-height: 0;
  color-scheme: light dark;
  background: transparent;
}
body {
  margin: 0;
  overflow: hidden;
  background: transparent;
  color: var(--text-normal);
  font-family: var(--font-text);
  font-size: 14px;
  line-height: 1.6;
}
#puppyone-md-html-content {
  display: flow-root;
  min-height: 0;
}
a {
  color: var(--text-accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
img,
video,
canvas,
svg {
  max-width: 100%;
}
pre,
code {
  font-family: var(--font-monospace);
}
${getHtmlPreviewInteractionCss("#puppyone-md-html-content")}
</style>
</head>
<body>
<div id="puppyone-md-html-content">
${source}
</div>
<script>
(() => {
  const frameId = ${JSON.stringify(frameId)};
  const postHeight = () => {
    const content = document.getElementById("puppyone-md-html-content");
    if (!content) return;
    const rect = content.getBoundingClientRect();
    const height = Math.ceil(Math.max(content.scrollHeight, rect.height));
    parent.postMessage({ type: "puppyone:markdown-html-height", id: frameId, height }, "*");
  };
  addEventListener("load", postHeight);
  if ("ResizeObserver" in window) {
    const content = document.getElementById("puppyone-md-html-content");
    if (content) new ResizeObserver(postHeight).observe(content);
  }
  requestAnimationFrame(postHeight);
  setTimeout(postHeight, 120);
})();
</script>
</body>
</html>`;
}

function getTrustedHtmlThemeCss(): string {
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;

  return `:root {
  --background-primary: ${read("--po-editor-bg", "#ffffff")};
  --background-primary-alt: ${read("--po-panel", "#f7f3ec")};
  --background-modifier-border: ${read("--po-divider", "#ded4c7")};
  --text-normal: ${read("--po-text", "#2f2a24")};
  --text-muted: ${read("--po-text-muted", "#8a8073")};
  --text-accent: ${read("--po-accent", "#2563eb")};
  --font-text: ${read("--po-font-sans", "ui-sans-serif, system-ui, sans-serif")};
  --font-monospace: ${read("--po-font-mono", "ui-monospace, SFMono-Regular, Menlo, monospace")};
}`;
}

function createTrustedHtmlFrameId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `md-html-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function estimateTrustedHtmlFrameHeight(source: string): number {
  return source.trim() ? 160 : 80;
}

function isTrustedHtmlHeightMessage(
  value: unknown,
  frameId: string,
): value is { type: "puppyone:markdown-html-height"; id: string; height: number } {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; id?: unknown; height?: unknown };
  return (
    message.type === "puppyone:markdown-html-height" &&
    message.id === frameId &&
    typeof message.height === "number" &&
    Number.isFinite(message.height)
  );
}

function createUnsupportedHtmlBlock(block: MarkdownHtmlBlock, reasons: string[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "cm-md-html-unsupported";

  const title = document.createElement("strong");
  title.textContent = "Unsupported HTML";
  wrapper.appendChild(title);

  const detail = document.createElement("span");
  detail.textContent = reasons[0] ?? `<${block.tagName}> is not supported in Markdown preview`;
  wrapper.appendChild(detail);

  const code = document.createElement("code");
  code.textContent = getHtmlPreviewSnippet(block.source);
  wrapper.appendChild(code);

  return wrapper;
}

function getHtmlPreviewSnippet(source: string): string {
  const normalized = source.trim().replace(/\s+/g, " ");
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137)}...`;
}

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

export class MarkdownTableWidget extends WidgetType {
  private readonly measure = new MarkdownWidgetMeasureController();

  constructor(
    private readonly from: number,
    private readonly to: number,
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
    wrapper.className = "cm-md-table-widget-wrap";
    const rowCount = this.rows.length;

    const table = document.createElement("table");
    table.className = "cm-md-table-widget";

    const header = this.rows.find((row) => row.header);
    if (header) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      for (const cell of header.cells) {
        const th = document.createElement("th");
        th.appendChild(createTableCellEditor(
          view,
          cell,
          0,
          rowCount,
          this.from,
          this.to,
          this.markdownLinkGraph,
          this.documentPath,
          this.markdownAssetUrlResolver,
        ));
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
        for (const cell of row.cells) {
          const td = document.createElement("td");
          td.appendChild(createTableCellEditor(
            view,
            cell,
            rowIndex,
            rowCount,
            this.from,
            this.to,
            this.markdownLinkGraph,
            this.documentPath,
            this.markdownAssetUrlResolver,
          ));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }

    wrapper.appendChild(table);
    this.measure.observe(wrapper, view);

    return wrapper;
  }

  destroy() {
    this.measure.destroy();
  }

  ignoreEvent() {
    return true;
  }
}

function createTableCellEditor(
  view: EditorView,
  cell: MarkdownTableCell,
  rowIndex: number,
  rowCount: number,
  tableFrom: number,
  tableTo: number,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
): HTMLElement {
  const content = document.createElement("span");
  content.className = "cm-md-table-cell-content";
  content.spellcheck = false;
  renderTableCellPreview(content, cell.text, markdownLinkGraph, documentPath, markdownAssetUrlResolver, () => {
    view.requestMeasure();
  });

  if (!view.state.readOnly && cell.editable) {
    let editing = false;
    content.contentEditable = "true";
    content.addEventListener("focus", () => {
      if (editing) return;
      editing = true;
      content.textContent = cell.text;
    });
    content.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "ArrowUp" && rowIndex === 0 && isContentEditableCaretAtBoundary(content, "start")) {
        event.preventDefault();
        view.dispatch({ selection: EditorSelection.cursor(tableFrom) });
        view.focus();
        return;
      }
      if (event.key === "ArrowDown" && rowIndex === rowCount - 1 && isContentEditableCaretAtBoundary(content, "end")) {
        event.preventDefault();
        view.dispatch({ selection: EditorSelection.cursor(tableTo) });
        view.focus();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        content.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        content.textContent = cell.text;
        content.blur();
      }
    });
    content.addEventListener("blur", () => {
      const nextValue = sanitizeMarkdownTableCell(content.textContent ?? "");
      editing = false;
      if (nextValue === cell.text) {
        renderTableCellPreview(content, cell.text, markdownLinkGraph, documentPath, markdownAssetUrlResolver, () => {
          view.requestMeasure();
        });
        view.requestMeasure();
        return;
      }
      view.dispatch({
        changes: {
          from: cell.from,
          to: cell.to,
          insert: nextValue,
        },
      });
    });
  }

  content.addEventListener("mousedown", stopCodeMirrorEvent);
  content.addEventListener("click", stopCodeMirrorEvent);
  content.addEventListener("input", stopCodeMirrorEvent);

  return content;
}

function renderTableCellPreview(
  content: HTMLElement,
  source: string,
  markdownLinkGraph: MarkdownLinkGraph | null,
  documentPath: string,
  markdownAssetUrlResolver: MarkdownAssetUrlResolver | null,
  onLayoutChange: () => void,
) {
  content.replaceChildren();
  renderMarkdownInlineInto(content, source, {
    markdownLinkGraph,
    markdownAssetUrlResolver,
    onLayoutChange,
    sourcePath: documentPath,
  });
}

function stopCodeMirrorEvent(event: Event) {
  event.stopPropagation();
}

function isContentEditableCaretAtBoundary(element: HTMLElement, boundary: "start" | "end"): boolean {
  const selection = element.ownerDocument.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
  const anchorNode = selection.anchorNode;
  if (!anchorNode || !element.contains(anchorNode)) return false;

  const range = selection.getRangeAt(0).cloneRange();
  const contentRange = element.ownerDocument.createRange();
  contentRange.selectNodeContents(element);

  if (boundary === "start") {
    contentRange.setEnd(range.startContainer, range.startOffset);
    return contentRange.toString().length === 0;
  }

  contentRange.setStart(range.endContainer, range.endOffset);
  return contentRange.toString().length === 0;
}

function sanitizeMarkdownTableCell(value: string): string {
  return normalizeLineEndings(value).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}

function sanitizeCodeLanguage(value: string): string {
  return value.trim().replace(/\s+/g, "-").replace(/[`~]/g, "");
}

function hasPointerMoved(event: MouseEvent, pointerDown: { x: number; y: number }): boolean {
  return Math.abs(event.clientX - pointerDown.x) > 4 || Math.abs(event.clientY - pointerDown.y) > 4;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function serializeMarkdownCodeBlock(language: string, code: string): string {
  const longestFence = Math.max(2, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  const info = language ? `${fence}${language}` : fence;
  return `${info}\n${code}\n${fence}`;
}

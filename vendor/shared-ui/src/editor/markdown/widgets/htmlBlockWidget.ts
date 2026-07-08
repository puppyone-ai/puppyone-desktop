import { EditorView, WidgetType } from "@codemirror/view";
import { getHtmlPreviewInteractionCss } from "../../htmlPreviewInteraction";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode } from "../../viewerTypes";
import { resolveMarkdownHtmlImageSources } from "../links/markdownImageModel";
import type { MarkdownHtmlBlock } from "../rendering/htmlBlockModel";
import { createSanitizedBlockHtmlFragment } from "../rendering/sanitizeHtml";
import {
  clampNumber,
  estimateMarkdownHtmlBlockHeight,
  MarkdownWidgetMeasureController,
} from "./markdownWidgetMeasure";

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

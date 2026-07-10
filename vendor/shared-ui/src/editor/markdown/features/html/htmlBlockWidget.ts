import { EditorView, WidgetType } from "@codemirror/view";
import type { MarkdownAssetUrlResolver, MarkdownHtmlTrustMode } from "../../../viewerTypes";
import { getMarkdownEmbedHost } from "../../platform/codemirror/embedHost";
import { disposeWidgetSessionDom } from "../../platform/codemirror/widgetSession";
import { bindInlineHtmlDomInteractions } from "./inlineHtmlDomAdapter";
import {
  resolveMarkdownHtmlImageSources,
  type BrokeredMarkdownAssetUrlResolver,
} from "../image/markdownImageModel";
import type { MarkdownHtmlBlock } from "./htmlBlockModel";
import { createSanitizedBlockHtmlFragment } from "./sanitizeHtml";
import type { AssetBrokerHandle } from "../../platform/brokers/assetBroker";
import {
  createPrincipalFromView,
  markdownWorkspaceIdFacet,
  openMarkdownHref,
} from "../../core/editor/markdownLivePreviewContext";
import { evaluateAuthorizationGrant, createDocumentTrustContext, type DocumentTrustContext } from "../../platform/policy/markdownTrustPolicy";
import { workspaceIdForDocument } from "../../platform/security/capabilityPrincipal";
import {
  clampNumber,
  estimateMarkdownHtmlBlockHeight,
  MarkdownWidgetMeasureController,
} from "../../shared/widgets/markdownWidgetMeasure";

function extractExternalHttpsEmbed(source: string): string | null {
  const trimmed = source.trim();
  const match = /^<iframe\b[^>]*\bsrc=["\'](https:\/\/[^"\']+)["\'][^>]*>\s*<\/iframe>$/i.exec(trimmed)
    ?? /^<iframe\b[^>]*\bsrc=["\'](https:\/\/[^"\']+)["\'][^>]*\/>$/i.exec(trimmed);
  return match?.[1] ?? null;
}

/**
 * Immutable HTML-block descriptor. Message listeners, timers, measure, asset
 * loads, and web-embed sessions belong to the mounted DOM session.
 */
export class HtmlBlockWidget extends WidgetType {
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
    const host = getMarkdownEmbedHost(view, {
      resolveAssetUrl: this.markdownAssetUrlResolver,
    });
    const documentTrustContext = (): DocumentTrustContext =>
      createDocumentTrustContext({
        workspaceId: view.state.facet(markdownWorkspaceIdFacet) || workspaceIdForDocument(this.documentPath),
        documentPath: this.documentPath,
        provenance: "unknown",
        explicitGrants: [],
      });
    const shell = document.createElement("div");
    shell.className = "cm-md-html-widget";
    const measure = new MarkdownWidgetMeasureController();
    let previewVersion = 0;
    let showingSource = false;
    let webEmbedId: string | null = null;
    const activeAssetHandles = new Set<AssetBrokerHandle>();
    let boundsUpdateListener: (() => void) | null = null;
    let boundsResizeObserver: ResizeObserver | null = null;

    const toolbar = document.createElement("div");
    toolbar.className = "cm-md-html-widget-toolbar";
    const toggleButton = document.createElement("button");
    toggleButton.className = "cm-md-html-source-toggle";
    toggleButton.type = "button";
    toolbar.appendChild(toggleButton);

    const content = document.createElement("div");
    content.className = "cm-md-html-widget-content";

    const stopBoundsTracking = () => {
      if (boundsUpdateListener) {
        window.removeEventListener("scroll", boundsUpdateListener, { capture: true } as EventListenerOptions);
        window.removeEventListener("resize", boundsUpdateListener);
        boundsUpdateListener = null;
      }
      boundsResizeObserver?.disconnect();
      boundsResizeObserver = null;
    };
    const startBoundsTracking = (embedId: string, element: HTMLElement) => {
      stopBoundsTracking();
      const updateBounds = () => {
        if (!element.isConnected || webEmbedId !== embedId) return;
        void host.webEmbeds.setBounds(embedId, getWebEmbedBounds(element));
      };
      boundsUpdateListener = updateBounds;
      window.addEventListener("scroll", updateBounds, { passive: true, capture: true });
      window.addEventListener("resize", updateBounds, { passive: true });
      if ("ResizeObserver" in window) {
        boundsResizeObserver = new ResizeObserver(updateBounds);
        boundsResizeObserver.observe(element);
      }
    };
    const clearPreviewLifecycle = () => {
      stopBoundsTracking();
      for (const handle of activeAssetHandles) handle.revoke();
      activeAssetHandles.clear();
      if (webEmbedId) {
        host.webEmbeds.destroy(webEmbedId);
        webEmbedId = null;
      }
    };

    const nextPreviewVersion = () => {
      previewVersion += 1;
      return previewVersion;
    };
    const isPreviewVersionCurrent = (version: number) => !measure.destroyed && previewVersion === version;

    const createWebEmbedPlaceholder = (href: string) => {
      const principal = createPrincipalFromView(view, "web-embed");
      const embed = host.webEmbeds.create({
        principal,
        href,
        privacyProfile: "temporary-no-credential",
      });
      webEmbedId = embed.id;

      const wrapper = document.createElement("div");
      wrapper.className = "cm-md-html-web-embed";
      wrapper.dataset.embedState = embed.state;

      if (embed.state === "blocked") {
        wrapper.textContent = "Blocked web embed";
        return wrapper;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cm-md-html-web-embed-load";
      button.textContent = `Load embed: ${href}`;
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        button.textContent = "Loading…";
        const initialBounds = getWebEmbedBounds(wrapper);
        startBoundsTracking(embed.id, wrapper);
        const activated = await host.webEmbeds.activate(embed.id, initialBounds);
        if (!activated || !wrapper.isConnected) {
          stopBoundsTracking();
          return;
        }
        wrapper.dataset.embedState = activated.state;
        if (activated.state === "loaded") {
          wrapper.replaceChildren();
          const frame = document.createElement("div");
          frame.className = "cm-md-html-web-embed-frame";
          frame.dataset.embedId = activated.id;
          frame.dataset.embedHref = href;
          frame.textContent = `Embedded: ${href}`;
          wrapper.appendChild(frame);
          measure.schedule(view);
        } else {
          stopBoundsTracking();
          button.disabled = false;
          button.textContent = `Load embed: ${href}`;
        }
      });
      wrapper.appendChild(button);
      return wrapper;
    };

    /**
     * Build an asset resolver that routes through the host's asset broker so
     * all image loads are tracked under a capability principal and can be
     * revoked on session dispose.
     */
    const buildBrokerAssetResolver = (version: number): BrokeredMarkdownAssetUrlResolver | null => {
      if (!this.markdownAssetUrlResolver) return null;
      const principal = createPrincipalFromView(view, "asset-read");
      return (docPath, href, signal) =>
        host.assets.resolve({ principal, sourcePath: docPath, href, signal })
          .then((handle) => {
            if (!handle) return null;
            if (signal?.aborted || !isPreviewVersionCurrent(version)) {
              handle.revoke();
              return null;
            }
            activeAssetHandles.add(handle);
            return handle.url;
          });
    };

    const createPreviewBlock = (version: number) => {
      const sanitizedOptions = {
        openHref: (href: string) => {
          openMarkdownHref(href, view);
        },
      };
      if (!this.block.closed) {
        return createUnsupportedHtmlBlock(this.block, ["HTML block is not closed"]);
      }

      const externalHref = extractExternalHttpsEmbed(this.block.source);
      if (externalHref) {
        return createWebEmbedPlaceholder(externalHref);
      }

      // Active HTML (scripts/forms/srcdoc) requires an explicit, revocable
      // local-active-html AuthorizationGrant evaluated by the trust policy.
      // Without a grant we ALWAYS render sanitized content — never a
      // script-capable srcdoc iframe — regardless of htmlTrustMode.
      const activeHtmlGrant = evaluateAuthorizationGrant(
        documentTrustContext(),
        createPrincipalFromView(view, "web-embed"),
        "local-active-html",
      );
      if ((!activeHtmlGrant || activeHtmlGrant.revoked) && this.htmlTrustMode === "localTrusted") {
        const wrapper = createSanitizedHtmlPreviewBlock(this.block, this.block.source, sanitizedOptions);
        const notice = document.createElement("div");
        notice.className = "cm-md-html-local-trusted-notice";
        notice.textContent = "Active HTML (scripts/forms) requires explicit trust grant — showing sanitized preview.";
        wrapper.prepend(notice);
        return wrapper;
      }

      // Even with localTrusted mode, never mount a script-capable srcdoc
      // iframe in the editor renderer. Active HTML requires a dedicated
      // sandboxed surface that is not yet shipped.
      if (activeHtmlGrant && !activeHtmlGrant.revoked) {
        const wrapper = createSanitizedHtmlPreviewBlock(this.block, this.block.source, sanitizedOptions);
        const notice = document.createElement("div");
        notice.className = "cm-md-html-local-trusted-notice";
        notice.textContent = "Active HTML grant recorded — editor still uses sanitized preview (no srcdoc iframe).";
        wrapper.prepend(notice);
        return wrapper;
      }

      const brokerResolver = buildBrokerAssetResolver(version);
      if (!brokerResolver) {
        return createSanitizedHtmlPreviewBlock(this.block, this.block.source, sanitizedOptions);
      }

      const wrapper = document.createElement("div");
      wrapper.className = "cm-md-html-rendered-surface cm-md-html-block is-loading";
      wrapper.appendChild(createTrustedHtmlLoader());
      resolveMarkdownHtmlImageSources(this.block.source, this.documentPath, brokerResolver)
        .then((source) => {
          if (!isPreviewVersionCurrent(version)) return;
          replaceWithSanitizedHtmlPreviewBlock(wrapper, this.block, source, {
            ...sanitizedOptions,
            brokeredMedia: true,
          });
          measure.schedule(view);
        })
        .catch(() => {
          if (!isPreviewVersionCurrent(version)) return;
          replaceWithSanitizedHtmlPreviewBlock(wrapper, this.block, this.block.source, sanitizedOptions);
          measure.schedule(view);
        });
      return wrapper;
    };

    const render = () => {
      clearPreviewLifecycle();
      const version = nextPreviewVersion();
      content.replaceChildren(
        showingSource ? createHtmlSourceBlock(this.block.source) : createPreviewBlock(version),
      );
      toggleButton.replaceChildren(createHtmlWidgetIcon(showingSource ? "preview" : "source"));
      toggleButton.title = showingSource ? "Show HTML preview" : "Show HTML source";
      toggleButton.setAttribute("aria-label", showingSource ? "Show HTML preview" : "Show HTML source");
      toggleButton.classList.toggle("active", showingSource);
      measure.schedule(view);
    };

    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showingSource = !showingSource;
      render();
    });

    render();
    shell.append(toolbar, content);
    measure.observe(shell, view);

    host.sessions.mount(shell, () => ({
      dispose() {
        clearPreviewLifecycle();
        measure.destroy();
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

function createHtmlSourceBlock(source: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "cm-md-html-source-block";

  const code = document.createElement("code");
  code.textContent = source;
  pre.appendChild(code);

  return pre;
}

function createSanitizedHtmlPreviewBlock(
  block: MarkdownHtmlBlock,
  source: string,
  options: { brokeredMedia?: boolean; openHref?: (href: string) => void } = {},
): HTMLElement {
  const result = createSanitizedBlockHtmlFragment(source, {
    brokeredMedia: options.brokeredMedia === true,
  });
  if (!result.supported) {
    return createUnsupportedHtmlBlock(block, result.reasons);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "cm-md-html-rendered-surface cm-md-html-block";
  wrapper.appendChild(result.fragment);
  bindInlineHtmlDomInteractions(wrapper, { openHref: options.openHref });
  return wrapper;
}

function replaceWithSanitizedHtmlPreviewBlock(
  target: HTMLElement,
  block: MarkdownHtmlBlock,
  source: string,
  options: { brokeredMedia?: boolean; openHref?: (href: string) => void } = {},
) {
  const nextBlock = createSanitizedHtmlPreviewBlock(block, source, options);
  target.className = nextBlock.className;
  target.replaceChildren(...Array.from(nextBlock.childNodes));
}

function getWebEmbedBounds(element: HTMLElement): { x: number; y: number; width: number; height: number } {
  // WebContentsView bounds are BrowserWindow content coordinates. DOMRect is
  // already viewport-relative; adding window.scrollX/Y makes native overlays
  // drift away from scrolled editor content.
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left);
  let top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right);
  let bottom = Math.min(window.innerHeight, rect.bottom);

  // Native child views do not honor renderer DOM overflow clipping. Showing a
  // partially clipped view would let it paint over editor/app chrome, so hide
  // it until the whole requested surface is inside every clipping ancestor.
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = window.getComputedStyle(ancestor);
    const ancestorRect = ancestor.getBoundingClientRect();
    if (/(auto|hidden|scroll|clip)/.test(style.overflowX)) {
      left = Math.max(left, ancestorRect.left);
      right = Math.min(right, ancestorRect.right);
    }
    if (/(auto|hidden|scroll|clip)/.test(style.overflowY)) {
      top = Math.max(top, ancestorRect.top);
      bottom = Math.min(bottom, ancestorRect.bottom);
    }
  }

  const fullyVisible =
    right > left &&
    bottom > top &&
    Math.abs(left - rect.left) < 1 &&
    Math.abs(top - rect.top) < 1 &&
    Math.abs(right - rect.right) < 1 &&
    Math.abs(bottom - rect.bottom) < 1;
  if (!fullyVisible) return { x: 0, y: 0, width: 0, height: 0 };

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
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

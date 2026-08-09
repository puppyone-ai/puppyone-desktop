"use client";

import { useEffect, useRef, useState } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import {
  assertDocxDomWithinBudget,
  CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE,
  getControlledDocxExternalHref,
  sanitizeDocxDom,
} from "../../security/docxDomSanitizer";
import {
  resolveWordPreviewScale,
  type WordPreviewZoom,
} from "./wordPreviewLayout";

type WordRenderState = {
  status: "loading" | "ready" | "error";
  message?: string;
};

export function WordDocumentPreview({
  arrayBuffer,
  documentPath,
  openExternalFile,
  openExternalUrl,
  zoom,
  onResolvedScaleChange,
}: {
  arrayBuffer: ArrayBuffer;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
  openExternalUrl?: (href: string) => void | Promise<void>;
  zoom: WordPreviewZoom;
  onResolvedScaleChange: (scale: number) => void;
}) {
  const { t } = useLocalization();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);
  const scaleChangeRef = useRef(onResolvedScaleChange);
  const [renderState, setRenderState] = useState<WordRenderState>({ status: "loading" });

  zoomRef.current = zoom;
  scaleChangeRef.current = onResolvedScaleChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let layoutFrame = 0;
    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadowRoot.replaceChildren();

    const fragment = document.createDocumentFragment();
    const baseStyle = document.createElement("style");
    baseStyle.textContent = WORD_PREVIEW_SHADOW_CSS;
    const styleContainer = document.createElement("div");
    styleContainer.className = "office-docx-style-container";
    const bodyContainer = document.createElement("div");
    bodyContainer.className = "office-docx-body";
    fragment.append(baseStyle, styleContainer, bodyContainer);
    setRenderState({ status: "loading" });

    const scheduleLayout = () => {
      cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        const scale = applyWordPreviewZoom(host, bodyContainer, zoomRef.current);
        scaleChangeRef.current(scale);
      });
    };

    const activateControlledLink = (event: Event) => {
      const link = findWordPreviewLinkInEvent(event);
      if (!link) return;

      if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();

      const internalHref = link.getAttribute("href");
      if (internalHref?.startsWith("#")) {
        findWordPreviewFragmentTarget(shadowRoot, internalHref)?.scrollIntoView({ block: "start" });
        return;
      }

      const externalHref = getControlledDocxExternalHref(link);
      if (externalHref && openExternalUrl) {
        void Promise.resolve().then(() => openExternalUrl(externalHref)).catch((error) => {
          setRenderState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    };
    shadowRoot.addEventListener("click", activateControlledLink);
    shadowRoot.addEventListener("keydown", activateControlledLink);

    import("docx-preview")
      .then(({ renderAsync }) => renderAsync(
        arrayBuffer.slice(0),
        bodyContainer,
        styleContainer,
        {
          renderAltChunks: false,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          renderChanges: false,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          useBase64URL: true,
          inWrapper: true,
          experimental: true,
          className: "office-docx",
        },
      ))
      .then(async () => {
        if (cancelled) return;
        assertDocxDomWithinBudget(fragment);
        sanitizeDocxDom(fragment);
        shadowRoot.replaceChildren(fragment);
        setRenderState({ status: "ready" });

        resizeObserver = new ResizeObserver(scheduleLayout);
        resizeObserver.observe(host);
        scheduleLayout();
        await document.fonts?.ready;
        scheduleLayout();
      })
      .catch((error) => {
        if (!cancelled) {
          setRenderState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(layoutFrame);
      resizeObserver?.disconnect();
      shadowRoot.removeEventListener("click", activateControlledLink);
      shadowRoot.removeEventListener("keydown", activateControlledLink);
      shadowRoot.replaceChildren();
    };
  }, [arrayBuffer, openExternalUrl]);

  useEffect(() => {
    if (renderState.status !== "ready") return;
    const host = hostRef.current;
    const bodyContainer = host?.shadowRoot?.querySelector<HTMLElement>(".office-docx-body");
    if (!host || !bodyContainer) return;
    const scale = applyWordPreviewZoom(host, bodyContainer, zoom);
    onResolvedScaleChange(scale);
  }, [onResolvedScaleChange, renderState.status, zoom]);

  if (renderState.status === "error") {
    return (
      <WordPreviewError
        title={t("editor.preview.failed")}
        message={t("editor.office.docxFailed", {
          detail: bidiIsolate(renderState.message ?? t("editor.office.unknownError")),
        })}
        documentPath={documentPath}
        openExternalFile={openExternalFile}
      />
    );
  }

  return (
    <div
      className="office-document-preview office-document-preview--docx"
      data-po-scrollbar="content"
      aria-busy={renderState.status === "loading"}
    >
      {renderState.status === "loading" && (
        <div className="office-docx-render-state">{t("editor.office.renderingWord")}</div>
      )}
      <div
        ref={hostRef}
        className="office-docx-host"
        data-rendering={renderState.status === "loading" ? "true" : undefined}
      />
    </div>
  );
}

function WordPreviewError({
  title,
  message,
  documentPath,
  openExternalFile,
}: {
  title: string;
  message: string;
  documentPath: string;
  openExternalFile?: (path: string) => Promise<void>;
}) {
  const { t } = useLocalization();
  const [externalOpenError, setExternalOpenError] = useState<string | null>(null);
  const openExternally = () => {
    if (!openExternalFile) return;
    setExternalOpenError(null);
    void Promise.resolve().then(() => openExternalFile(documentPath)).catch((error) => {
      setExternalOpenError(error instanceof Error ? error.message : String(error));
    });
  };

  return (
    <div className="office-preview-empty">
      <strong>{title}</strong>
      <span dir="auto">{message}</span>
      {openExternalFile && (
        <button type="button" onClick={openExternally}>{t("editor.openDefaultApp")}</button>
      )}
      {externalOpenError && (
        <span role="alert">
          {t("editor.office.openDesktopFailed", { detail: bidiIsolate(externalOpenError) })}
        </span>
      )}
    </div>
  );
}

function applyWordPreviewZoom(
  host: HTMLElement,
  bodyContainer: HTMLElement,
  zoom: WordPreviewZoom,
): number {
  const wrapper = bodyContainer.querySelector<HTMLElement>(".docx-wrapper") ?? bodyContainer;
  const firstPage = bodyContainer.querySelector<HTMLElement>(".office-docx");
  if (!firstPage) return 1;

  wrapper.style.zoom = "1";
  const pageWidth = firstPage.getBoundingClientRect().width;
  const scale = resolveWordPreviewScale({
    availableWidth: host.clientWidth - 32,
    pageWidth,
    zoom,
  });
  wrapper.style.zoom = String(scale);
  return scale;
}

function findWordPreviewLinkInEvent(event: Event): Element | null {
  for (const target of event.composedPath()) {
    if (!(target instanceof Element)) continue;
    if (
      target.hasAttribute(CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE)
      || target.getAttribute("href")?.startsWith("#")
    ) {
      return target;
    }
  }
  return null;
}

function findWordPreviewFragmentTarget(shadowRoot: ShadowRoot, href: string): Element | null {
  let fragmentId = href.slice(1);
  try {
    fragmentId = decodeURIComponent(fragmentId);
  } catch {
    return null;
  }
  return fragmentId ? shadowRoot.getElementById(fragmentId) : null;
}

const WORD_PREVIEW_SHADOW_CSS = `
  @font-face {
    font-family: "宋体";
    src: local("Songti SC"), local("STSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "SimSun";
    src: local("Songti SC"), local("STSong"), local("Noto Serif CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "黑体";
    src: local("PingFang SC"), local("STHeiti"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "SimHei";
    src: local("PingFang SC"), local("STHeiti"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "等线";
    src: local("PingFang SC"), local("Microsoft YaHei"), local("Noto Sans CJK SC");
    font-display: swap;
  }

  @font-face {
    font-family: "Calibri";
    src: local("Aptos"), local("Calibri"), local("Arial");
    font-display: swap;
  }

  @font-face {
    font-family: "Cambria";
    src: local("Cambria"), local("Georgia"), local("Times New Roman");
    font-display: swap;
  }

  :host {
    display: block;
    width: 100%;
    min-width: 0;
    color-scheme: light;
  }

  .office-docx-style-container {
    display: contents;
  }

  .office-docx-body {
    display: flex;
    justify-content: center;
    width: 100%;
    min-width: 0;
    color: #171717;
    font-synthesis: none;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .office-docx-body .docx-wrapper {
    box-sizing: border-box;
    display: block;
    width: max-content;
    max-width: none;
    min-width: 0;
    padding: 0 !important;
    background: transparent !important;
    transform-origin: top center;
  }

  .office-docx-body .office-docx {
    margin: 0 auto 20px !important;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 2px;
    background: #fff !important;
    color: #171717;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1), 0 14px 36px rgba(15, 23, 42, 0.14);
  }

  [${CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE}] {
    cursor: var(--po-clickable-cursor, pointer);
    text-decoration: underline;
  }

  [${CONTROLLED_DOCX_EXTERNAL_HREF_ATTRIBUTE}]:focus-visible {
    border-radius: 2px;
    outline: 2px solid #5b8def;
    outline-offset: 2px;
  }
`;

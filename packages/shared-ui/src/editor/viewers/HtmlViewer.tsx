"use client";

import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { CodeMirrorCodeEditor } from "../CodeMirrorCodeEditor";
import { DocumentSurfacePending } from "../DocumentSurfaceHost";
import { getHtmlPreviewInteractionCss } from "../htmlPreviewInteraction";
import type { MarkdownHtmlTrustMode, PresetViewerRenderContext } from "../viewerTypes";
import { TextEditorFrame } from "./TextEditorFrame";
import { useVisibleFrameReadiness } from "./useVisibleFrameReadiness";

export function HtmlViewer({
  document,
  content,
  fileUrl,
  fileUrlLoading,
  fileUrlError,
  loading,
  error,
  htmlTrustMode,
  canEdit,
  hideSourceView,
}: Pick<
  PresetViewerRenderContext,
  | "document"
  | "content"
  | "fileUrl"
  | "fileUrlLoading"
  | "fileUrlError"
  | "loading"
  | "error"
  | "htmlTrustMode"
  | "canEdit"
  | "hideSourceView"
>) {
  const { t } = useLocalization();

  if (loading && content === "" && !fileUrl) return <DocumentSurfacePending label={t("editor.html.loading")} />;
  if (error && content === "" && !fileUrl) return <div className="editor-state danger" dir="auto">{error}</div>;
  if (fileUrlLoading && !content && !fileUrl) return <DocumentSurfacePending label={t("editor.preview.loading")} />;
  if (fileUrlError && !content && !fileUrl) {
    return (
      <div className="editor-state danger">
        {t("editor.html.loadFailed", { detail: bidiIsolate(fileUrlError) })}
      </div>
    );
  }

  return (
    <TextEditorFrame
      documentId={document.path}
      documentVersion={document.version}
      content={content}
      nodeName={document.name}
      defaultMode="source"
      canEdit={canEdit}
      hideSourceView={hideSourceView}
      liveModeLabel={t("editor.html.preview")}
      sourceModeLabel={t("editor.html.source")}
      liveModeIcon="preview"
      sourceSnapshotMode
      renderLive={(value) => (
        <div className="native-preview native-preview-framed">
          <HtmlPreviewFrame
            path={document.path}
            title={document.name}
            content={value}
            fileUrl={fileUrl}
            htmlTrustMode={htmlTrustMode}
          />
        </div>
      )}
      renderSource={(value, controls) => (
        <CodeMirrorCodeEditor
          content={value}
          nodeName={document.name}
          language="html"
          readOnly={!controls.canEdit}
          onSourceRevisionChange={controls.onSourceRevisionChange}
          onSnapshotPortChange={controls.onSnapshotPortChange}
        />
      )}
    />
  );
}

function HtmlPreviewFrame({
  path,
  title,
  content,
  fileUrl,
  htmlTrustMode,
}: {
  path: string;
  title: string;
  content?: string | null;
  fileUrl?: string | null;
  htmlTrustMode: MarkdownHtmlTrustMode;
}) {
  const policy = getHtmlPreviewPolicy(htmlTrustMode);
  const hasContentSnapshot = content !== null && content !== undefined;
  const useFileUrl = Boolean(fileUrl && !hasContentSnapshot);
  const frameKey = [
    path,
    htmlTrustMode,
    fileUrl ?? "",
    hasContentSnapshot ? `${content.length}:${hashString(content)}` : "",
  ].join("|");
  const frameReadiness = useVisibleFrameReadiness(frameKey);

  return (
    <iframe
      key={frameKey}
      className="native-preview-frame"
      data-html-trust-mode={htmlTrustMode}
      title={title}
      sandbox={policy.sandbox}
      referrerPolicy="no-referrer"
      src={useFileUrl ? fileUrl ?? undefined : undefined}
      srcDoc={!useFileUrl && hasContentSnapshot ? buildHtmlPreviewDocument(content, fileUrl, policy) : undefined}
      aria-busy={!frameReadiness.ready}
      onLoad={frameReadiness.onFrameLoad}
    />
  );
}

type HtmlPreviewPolicy = {
  sandbox: string;
  csp: string | null;
};

const SAFE_HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data: blob: https: puppyone-local:",
  "media-src data: blob: https: puppyone-local:",
  "style-src 'unsafe-inline' https: puppyone-local:",
  "font-src data: https: puppyone-local:",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "base-uri https: puppyone-local:",
  "form-action 'none'",
].join("; ");

function getHtmlPreviewPolicy(htmlTrustMode: MarkdownHtmlTrustMode): HtmlPreviewPolicy {
  if (htmlTrustMode === "localTrusted") {
    return {
      sandbox: "allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts",
      csp: null,
    };
  }

  return {
    sandbox: "allow-popups allow-popups-to-escape-sandbox",
    csp: SAFE_HTML_PREVIEW_CSP,
  };
}

function buildHtmlPreviewDocument(rawHtml: string, baseHref: string | null | undefined, policy: HtmlPreviewPolicy): string {
  const csp = policy.csp
    ? `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(policy.csp)}">`
    : "";
  const base = baseHref
    ? `<base href="${escapeHtmlAttribute(baseHref)}" target="_blank">`
    : '<base target="_blank">';
  const interactionStyle = `<style id="puppyone-html-preview-interaction">${getHtmlPreviewInteractionCss("body")}</style>`;

  if (/<head[\s>]/i.test(rawHtml)) {
    return rawHtml.replace(/<head([^>]*)>/i, `<head$1>${csp}${base}${interactionStyle}`);
  }

  if (/<html[\s>]/i.test(rawHtml)) {
    return rawHtml.replace(/<html([^>]*)>/i, `<html$1><head>${csp}${base}${interactionStyle}</head>`);
  }

  return `<!doctype html><html><head>${csp}${base}${interactionStyle}</head><body>${rawHtml}</body></html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { FilePreviewIcon } from "../../file/fileIcons";
import type { PresetViewerRenderContext } from "../viewerTypes";

type ResourceViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "content"
  | "fileUrl"
  | "fileUrlLoading"
  | "fileUrlError"
  | "fileIconTheme"
>;

export function ImageResourceViewer({ document, content, fileUrl, fileUrlLoading, fileUrlError }: ResourceViewerProps) {
  const imageSource = fileUrl || content || document.preview || null;
  return (
    <ResourcePreviewState fileUrl={imageSource} loading={fileUrlLoading} error={fileUrlError} kind="image">
      {(url) => (
        <div className="native-preview native-preview-centered">
          <img className="native-image-preview" src={url} alt={document.name} />
        </div>
      )}
    </ResourcePreviewState>
  );
}

export function PdfResourceViewer({ document, fileUrl, fileUrlLoading, fileUrlError }: ResourceViewerProps) {
  return (
    <ResourcePreviewState fileUrl={fileUrl} loading={fileUrlLoading} error={fileUrlError} kind="pdf">
      {(url) => (
        <div className="native-preview native-preview-framed">
          <PdfPreviewFrame url={url} title={document.name} />
        </div>
      )}
    </ResourcePreviewState>
  );
}

export function AudioResourceViewer({ document, fileUrl, fileUrlLoading, fileUrlError, fileIconTheme }: ResourceViewerProps) {
  return (
    <ResourcePreviewState fileUrl={fileUrl} loading={fileUrlLoading} error={fileUrlError} kind="audio">
      {(url) => (
        <div className="native-preview native-preview-centered">
          <div className="native-media-card">
            <FilePreviewIcon name={document.name} type="audio" size={54} theme={fileIconTheme} />
            <strong dir="auto">{document.name}</strong>
            <audio controls preload="metadata">
              <source src={url} type={document.mimeType ?? undefined} />
              <UnsupportedMedia kind="audio" />
            </audio>
          </div>
        </div>
      )}
    </ResourcePreviewState>
  );
}

export function VideoResourceViewer({ document, fileUrl, fileUrlLoading, fileUrlError }: ResourceViewerProps) {
  return (
    <ResourcePreviewState fileUrl={fileUrl} loading={fileUrlLoading} error={fileUrlError} kind="video">
      {(url) => (
        <div className="native-preview native-preview-centered">
          <video className="native-video-preview" controls preload="metadata">
            <source src={url} type={document.mimeType ?? undefined} />
            <UnsupportedMedia kind="video" />
          </video>
        </div>
      )}
    </ResourcePreviewState>
  );
}

function ResourcePreviewState({
  fileUrl,
  loading,
  error,
  kind,
  children,
}: {
  fileUrl?: string | null;
  loading: boolean;
  error?: string | null;
  kind: "image" | "pdf" | "audio" | "video";
  children: (fileUrl: string) => ReactNode;
}) {
  const { t } = useLocalization();
  if (error) {
    return (
      <div className="editor-state danger">
        {t("editor.resource.loadFailed", {
          kind: t(`editor.resource.kind.${kind}`),
          detail: bidiIsolate(error),
        })}
      </div>
    );
  }
  if (loading && !fileUrl) return <div className="editor-state">{t("editor.preview.loading")}</div>;
  if (!fileUrl) {
    return (
      <div className="editor-state">
        {t("editor.resource.unavailable", { kind: t(`editor.resource.kind.${kind}`) })}
      </div>
    );
  }
  return <>{children(fileUrl)}</>;
}

function UnsupportedMedia({ kind }: { kind: "audio" | "video" }) {
  const { t } = useLocalization();
  return <>{t(`editor.resource.unsupported.${kind}`)}</>;
}

function PdfPreviewFrame({ url, title }: { url: string; title: string }) {
  const { t } = useLocalization();
  const shouldUseBlobUrl = url.startsWith("puppyone-local:");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobError, setBlobError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldUseBlobUrl) {
      setBlobUrl(null);
      setBlobError(null);
      return undefined;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    setBlobUrl(null);
    setBlobError(null);

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        const pdfBlob = blob.type === "application/pdf"
          ? blob
          : blob.slice(0, blob.size, "application/pdf");
        objectUrl = URL.createObjectURL(pdfBlob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlobUrl(objectUrl);
      })
      .catch((error) => {
        if (!cancelled) setBlobError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shouldUseBlobUrl, url]);

  if (!shouldUseBlobUrl) {
    return <iframe className="native-preview-frame" src={url} title={title} />;
  }

  if (blobError) {
    return (
      <div className="editor-state danger">
        {t("editor.resource.loadFailed", {
          kind: t("editor.resource.kind.pdf"),
          detail: bidiIsolate(blobError),
        })}
      </div>
    );
  }

  if (!blobUrl) {
    return <div className="editor-state">{t("editor.preview.loading")}</div>;
  }

  return <iframe className="native-preview-frame" src={blobUrl} title={title} />;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";
import { FilePreviewIcon } from "../../file/fileIcons";
import { DocumentSurfacePending } from "../DocumentSurfaceHost";
import type { PresetViewerRenderContext } from "../viewerTypes";

type ResourceViewerProps = Pick<
  PresetViewerRenderContext,
  | "document"
  | "fileUrl"
  | "fileUrlLoading"
  | "fileUrlError"
  | "fileIconTheme"
>;

export function ImageResourceViewer({ document, fileUrl, fileUrlLoading, fileUrlError }: ResourceViewerProps) {
  return (
    <ResourcePreviewState fileUrl={fileUrl} loading={fileUrlLoading} error={fileUrlError} kind="image">
      {(url) => (
        <ImagePreviewSurface url={url} name={document.name} />
      )}
    </ResourcePreviewState>
  );
}

function ImagePreviewSurface({ url, name }: { url: string; name: string }) {
  const { t } = useLocalization();
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ready = readyUrl === url;
  const failed = failedUrl === url;

  if (failed) {
    return (
      <div className="editor-state danger">
        {t("editor.resource.unavailable", { kind: t("editor.resource.kind.image") })}
      </div>
    );
  }

  return (
    <div
      className="native-preview native-preview-centered native-image-preview-shell"
      data-po-scrollbar="content"
      data-preview-state={ready ? "ready" : "loading"}
      aria-busy={!ready}
    >
      {!ready && <DocumentSurfacePending label={t("editor.preview.loading")} />}
      <img
        key={url}
        className="native-image-preview"
        src={url}
        alt={name}
        decoding="async"
        hidden={!ready}
        aria-hidden={!ready}
        onLoad={(event) => {
          const image = event.currentTarget;
          const markReady = () => setReadyUrl(url);
          if (typeof image.decode !== "function") {
            markReady();
            return;
          }
          void image.decode().catch(() => undefined).then(markReady);
        }}
        onError={() => setFailedUrl(url)}
      />
    </div>
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
        <AudioPreviewSurface
          url={url}
          name={document.name}
          mimeType={document.mimeType}
          fileIconTheme={fileIconTheme}
        />
      )}
    </ResourcePreviewState>
  );
}

export function VideoResourceViewer({ document, fileUrl, fileUrlLoading, fileUrlError }: ResourceViewerProps) {
  return (
    <ResourcePreviewState fileUrl={fileUrl} loading={fileUrlLoading} error={fileUrlError} kind="video">
      {(url) => (
        <VideoPreviewSurface url={url} mimeType={document.mimeType} />
      )}
    </ResourcePreviewState>
  );
}

function AudioPreviewSurface({
  url,
  name,
  mimeType,
  fileIconTheme,
}: {
  url: string;
  name: string;
  mimeType?: string | null;
  fileIconTheme: ResourceViewerProps["fileIconTheme"];
}) {
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const ready = readyUrl === url;
  return (
    <div
      className="native-preview native-preview-centered"
      data-po-scrollbar="content"
      aria-busy={!ready}
    >
      <div className="native-media-card">
        <FilePreviewIcon name={name} type="audio" size={54} theme={fileIconTheme} />
        <strong dir="auto">{name}</strong>
        <audio
          key={url}
          controls
          preload="metadata"
          onLoadedMetadata={() => setReadyUrl(url)}
          onError={() => setReadyUrl(url)}
        >
          <source src={url} type={mimeType ?? undefined} />
          <UnsupportedMedia kind="audio" />
        </audio>
      </div>
    </div>
  );
}

function VideoPreviewSurface({ url, mimeType }: { url: string; mimeType?: string | null }) {
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const ready = readyUrl === url;
  return (
    <div
      className="native-preview native-preview-centered"
      data-po-scrollbar="content"
      aria-busy={!ready}
    >
      <video
        key={url}
        className="native-video-preview"
        controls
        preload="metadata"
        onLoadedMetadata={() => setReadyUrl(url)}
        onError={() => setReadyUrl(url)}
      >
        <source src={url} type={mimeType ?? undefined} />
        <UnsupportedMedia kind="video" />
      </video>
    </div>
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
  if (loading && !fileUrl) return <DocumentSurfacePending label={t("editor.preview.loading")} />;
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
  const [readyFrameUrl, setReadyFrameUrl] = useState<string | null>(null);

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

  if (shouldUseBlobUrl && !blobUrl) {
    return <DocumentSurfacePending label={t("editor.preview.loading")} />;
  }

  const frameUrl = shouldUseBlobUrl ? blobUrl as string : url;
  return (
    <iframe
      key={frameUrl}
      className="native-preview-frame"
      src={frameUrl}
      title={title}
      aria-busy={readyFrameUrl !== frameUrl}
      onLoad={() => setReadyFrameUrl(frameUrl)}
    />
  );
}

import type { EditorDocument } from "../viewerTypes";
import { bidiIsolate } from "@puppyone/localization/core";
import { useLocalization } from "@puppyone/localization/react";

export function DocumentPreview({
  document,
  title,
}: {
  document: EditorDocument;
  title: string;
}) {
  const { t } = useLocalization();
  const fallbackTitle = title.trim();
  const fileName = document.name || document.path || fallbackTitle || t("editor.file");
  const status = fallbackTitle && fallbackTitle !== fileName
    ? fallbackTitle
    : t("editor.preview.unavailable");
  const metadata = getDocumentMetadata(document, fallbackTitle, fileName, t);

  return (
    <div
      className="document-preview"
      role="status"
      aria-label={t("editor.preview.unavailableFor", { name: bidiIsolate(fileName) })}
    >
      <section className="document-preview__summary">
        <span className="document-preview__eyebrow">{t("editor.file")}</span>
        <h2 className="document-preview__name" dir="auto">{fileName}</h2>
        <p className="document-preview__status" dir="auto">{status}</p>
        {metadata && <span className="document-preview__meta" dir="auto">{metadata}</span>}
      </section>
    </div>
  );
}

function getDocumentMetadata(
  document: EditorDocument,
  fallbackTitle: string,
  fileName: string,
  t: ReturnType<typeof useLocalization>["t"],
): string {
  const values = [document.mimeType, formatDocumentType(document.type, t)]
    .filter((value): value is string => Boolean(value))
    .filter((value) => !sameLabel(value, fallbackTitle) && !sameLabel(value, fileName));

  return Array.from(new Set(values.map((value) => value.trim()))).join(" / ");
}

function formatDocumentType(
  type: EditorDocument["type"],
  t: ReturnType<typeof useLocalization>["t"],
): string | null {
  const normalized = type.trim();
  if (!normalized || normalized === "file") return null;
  if (normalized.endsWith(" file")) return normalized;
  return t("editor.preview.fileType", { type: bidiIsolate(normalized) });
}

function sameLabel(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

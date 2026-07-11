import type { WidgetType } from "@codemirror/view";
import { ImagePreviewWidget } from "./image/imagePreviewWidget";

export type MarkdownImageFeatureDescriptor = {
  from: number;
  to: number;
  alt: string;
  source: string;
  title: string | null;
  documentPath: string;
};

/** Composition boundary for atomic inline features with dedicated widgets. */
export function createMarkdownImageFeatureWidget(
  descriptor: MarkdownImageFeatureDescriptor,
): WidgetType {
  return new ImagePreviewWidget(
    descriptor.from,
    descriptor.to,
    descriptor.alt,
    descriptor.source,
    descriptor.title,
    descriptor.documentPath,
  );
}

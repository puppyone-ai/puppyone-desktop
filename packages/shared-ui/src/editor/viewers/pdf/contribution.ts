import { definePresetViewer } from "../../registry/presetViewerContribution";

export const pdfViewerContribution = definePresetViewer({
  id: "pdf-preview",
  match: ({ document, format }) => document.type === "pdf" || format.defaultViewer === "pdf-preview",
  load: () => import("./PdfViewer").then(({ PdfResourceViewer }) => ({ default: PdfResourceViewer })),
});

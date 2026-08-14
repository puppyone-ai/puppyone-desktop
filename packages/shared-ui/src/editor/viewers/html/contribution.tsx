import { HtmlViewer } from "./HtmlViewer";
import { definePresetViewer } from "../../registry/presetViewerContribution";

export const htmlViewerContribution = definePresetViewer({
  id: "html-artifact",
  allowPreviewContent: false,
  match: ({ document, format }) => document.type === "html" || format.defaultViewer === "html-artifact",
  isEditable: () => true,
  render: (context) => <HtmlViewer {...context} />,
});

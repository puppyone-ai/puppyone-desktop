import type { PresetViewerContribution } from "./viewerTypes";
import { markdownViewerContribution } from "../markdown/contribution";
import { appPreviewViewerContribution } from "../viewers/app/contribution";
import { jsonViewerContribution, textViewerContribution } from "../viewers/code/contributions";
import { csvTableViewerContribution } from "../viewers/csv/contribution";
import { fallbackViewerContribution } from "../viewers/fallback/contribution";
import { htmlViewerContribution } from "../viewers/html/contribution";
import {
  audioViewerContribution,
  imageViewerContribution,
  videoViewerContribution,
} from "../viewers/media/contributions";
import { officeViewerContribution } from "../viewers/office/contribution";
import { pdfViewerContribution } from "../viewers/pdf/contribution";
import { puppyFlowViewerContribution } from "../viewers/puppyflow/contribution";

export const BUILTIN_VIEWER_CONTRIBUTIONS: readonly PresetViewerContribution[] = Object.freeze([
  appPreviewViewerContribution,
  markdownViewerContribution,
  puppyFlowViewerContribution,
  jsonViewerContribution,
  csvTableViewerContribution,
  htmlViewerContribution,
  imageViewerContribution,
  pdfViewerContribution,
  officeViewerContribution,
  audioViewerContribution,
  videoViewerContribution,
  textViewerContribution,
]);

export { fallbackViewerContribution };

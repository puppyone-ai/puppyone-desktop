import { PRESET_VIEWER_MANIFEST } from "@puppyone/shared-ui";

export type OfficialViewerIcon =
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "media";

export type OfficialViewerCatalogEntry = Readonly<{
  id: string;
  title: string;
  icon: OfficialViewerIcon;
  viewerIds: readonly string[];
  formats: readonly string[];
}>;

export const OFFICIAL_VIEWER_CATALOG = Object.freeze([
  {
    id: "documents",
    title: "Documents",
    icon: "document",
    viewerIds: ["office-preview"],
    formats: ["DOCX", "DOC", "ODT", "RTF"],
  },
  {
    id: "spreadsheets",
    title: "Spreadsheets",
    icon: "spreadsheet",
    viewerIds: ["office-preview"],
    formats: ["XLSX", "XLS", "XLSM", "ODS"],
  },
  {
    id: "presentations",
    title: "Presentations",
    icon: "presentation",
    viewerIds: ["office-preview"],
    formats: ["PPTX", "PPSX", "ODP"],
  },
  {
    id: "pdf",
    title: "PDF",
    icon: "pdf",
    viewerIds: ["pdf-preview"],
    formats: ["PDF"],
  },
  {
    id: "images",
    title: "Images",
    icon: "image",
    viewerIds: ["image-preview"],
    formats: ["PNG", "JPG", "SVG", "WEBP", "GIF"],
  },
  {
    id: "media",
    title: "Audio & video",
    icon: "media",
    viewerIds: ["audio-preview", "video-preview"],
    formats: ["MP3", "WAV", "MP4", "WEBM"],
  },
] satisfies readonly OfficialViewerCatalogEntry[]);

const presetViewerIds = new Set(PRESET_VIEWER_MANIFEST.viewers.map((viewer) => viewer.id));

export function getInvalidOfficialViewerCatalogIds() {
  return OFFICIAL_VIEWER_CATALOG
    .filter((entry) => entry.viewerIds.some((viewerId) => !presetViewerIds.has(viewerId)))
    .map((entry) => entry.id);
}

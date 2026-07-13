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
  icon: OfficialViewerIcon;
  viewerIds: readonly string[];
  formats: readonly string[];
}>;

export const OFFICIAL_VIEWER_CATALOG = Object.freeze([
  {
    id: "documents",
    icon: "document",
    viewerIds: ["office-preview"],
    formats: ["DOCX", "DOC", "ODT", "RTF"],
  },
  {
    id: "spreadsheets",
    icon: "spreadsheet",
    viewerIds: ["office-preview"],
    formats: ["XLSX", "XLS", "XLSM", "ODS"],
  },
  {
    id: "presentations",
    icon: "presentation",
    viewerIds: ["office-preview"],
    formats: ["PPTX", "PPSX", "ODP"],
  },
  {
    id: "pdf",
    icon: "pdf",
    viewerIds: ["pdf-preview"],
    formats: ["PDF"],
  },
  {
    id: "images",
    icon: "image",
    viewerIds: ["image-preview"],
    formats: ["PNG", "JPG", "SVG", "WEBP", "GIF"],
  },
  {
    id: "media",
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

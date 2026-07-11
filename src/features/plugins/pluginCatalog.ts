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
  description: string;
  icon: OfficialViewerIcon;
  viewerIds: readonly string[];
  formats: readonly string[];
}>;

export const OFFICIAL_VIEWER_CATALOG = Object.freeze([
  {
    id: "documents",
    title: "Documents",
    description: "Safe local previews for Word, OpenDocument, and rich-text files.",
    icon: "document",
    viewerIds: ["office-preview"],
    formats: ["DOCX", "DOC", "ODT", "RTF"],
  },
  {
    id: "spreadsheets",
    title: "Spreadsheets",
    description: "Bounded workbook previews with sheet navigation and large-grid virtualization.",
    icon: "spreadsheet",
    viewerIds: ["office-preview"],
    formats: ["XLSX", "XLS", "XLSM", "ODS"],
  },
  {
    id: "presentations",
    title: "Presentations",
    description: "Local slide rendering for modern PowerPoint and OpenDocument presentations.",
    icon: "presentation",
    viewerIds: ["office-preview"],
    formats: ["PPTX", "PPSX", "ODP"],
  },
  {
    id: "pdf",
    title: "PDF",
    description: "Fast browser-isolated PDF preview with local resource authorization.",
    icon: "pdf",
    viewerIds: ["pdf-preview"],
    formats: ["PDF"],
  },
  {
    id: "images",
    title: "Images",
    description: "Responsive previews for common raster, vector, and animated image formats.",
    icon: "image",
    viewerIds: ["image-preview"],
    formats: ["PNG", "JPG", "SVG", "WEBP", "GIF"],
  },
  {
    id: "media",
    title: "Audio & video",
    description: "Native local playback with no upload or background synchronization.",
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

const ATTACHMENT_KINDS = Object.freeze(["image", "text", "audio", "video", "binary"]);

const TEXT_EXTENSIONS = new Set([
  ".bash", ".c", ".cc", ".cfg", ".conf", ".cpp", ".cs", ".css", ".csv", ".env",
  ".gql", ".go", ".graphql", ".h", ".hpp", ".htm", ".html", ".ini", ".java", ".js",
  ".json", ".jsonl", ".jsx", ".kt", ".md", ".mdx", ".mjs", ".cjs", ".py", ".rb",
  ".rs", ".sh", ".sql", ".svg", ".swift", ".toml", ".ts", ".tsv", ".tsx", ".txt",
  ".xml", ".yaml", ".yml", ".zsh",
]);
const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"]);
const VIDEO_EXTENSIONS = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"]);

export function classifyAgentAttachment({ mime = "", name = "" } = {}) {
  const normalizedMime = normalizeMime(mime);
  const extension = fileExtension(name);
  if (normalizedMime === "image/svg+xml" || isTextMime(normalizedMime) || TEXT_EXTENSIONS.has(extension)) return "text";
  if (normalizedMime.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) return "image";
  if (normalizedMime.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (normalizedMime.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) return "video";
  return "binary";
}

export function acceptsAgentAttachment(capabilities, attachment) {
  const kind = classifyAgentAttachment(attachment);
  const input = capabilities?.attachments?.[kind];
  if (input?.accepted !== true) return false;
  const mime = normalizeMime(attachment?.mime);
  const extension = fileExtension(attachment?.name);
  const mimeTypes = array(input.mimeTypes).map(normalizeMime).filter(Boolean);
  const extensions = array(input.extensions).map(normalizeExtension).filter(Boolean);
  if (mimeTypes.length === 0 && extensions.length === 0) return true;
  return (mime && mimeTypes.some((pattern) => mimeMatches(pattern, mime)))
    || (extension && extensions.includes(extension));
}

export function hasAgentAttachmentSupport(capabilities) {
  return ATTACHMENT_KINDS.some((kind) => capabilities?.attachments?.[kind]?.accepted === true);
}

export function acceptedAgentAttachmentPickerTypes(capabilities) {
  const accepted = ATTACHMENT_KINDS.map((kind) => capabilities?.attachments?.[kind])
    .filter((input) => input?.accepted === true);
  if (accepted.some((input) => array(input.mimeTypes).length === 0 && array(input.extensions).length === 0)) return [];
  return Array.from(new Set(accepted.flatMap((input) => {
    return [...array(input.mimeTypes), ...array(input.extensions)]
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);
  })));
}

export function isTextMime(value) {
  const mime = normalizeMime(value);
  return mime.startsWith("text/")
    || mime === "application/json"
    || mime.endsWith("+json")
    || mime === "application/javascript"
    || mime === "application/xml"
    || mime.endsWith("+xml")
    || mime === "application/yaml"
    || mime === "application/toml";
}

function mimeMatches(pattern, mime) {
  if (pattern.endsWith("/*")) return mime.startsWith(pattern.slice(0, -1));
  return pattern === mime;
}

function normalizeMime(value) {
  return typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";
}

function normalizeExtension(value) {
  const extension = typeof value === "string" ? value.trim().toLowerCase() : "";
  return extension.startsWith(".") ? extension : extension ? `.${extension}` : "";
}

function fileExtension(value) {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

export const agentAttachmentKinds = ATTACHMENT_KINDS;

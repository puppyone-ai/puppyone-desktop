import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ACP_INLINE_IMAGE_MAX_BYTES } from "./acp-limits.mjs";

export async function materializeAcpImageReferences(references) {
  return Promise.all(array(references).map(async (reference) => {
    if (reference?.kind !== "staged-attachment" || reference.snapshotUrl) return reference;
    if (!reference.mime?.startsWith("image/") || typeof reference.path !== "string" || !path.isAbsolute(reference.path)) {
      return reference;
    }
    const metadata = await fs.promises.lstat(reference.path).catch(() => null);
    if (!metadata?.isFile() || metadata.isSymbolicLink() || metadata.size > ACP_INLINE_IMAGE_MAX_BYTES) {
      throw invalidImageError();
    }
    const bytes = await fs.promises.readFile(reference.path);
    return { ...reference, snapshotUrl: `data:${reference.mime};base64,${bytes.toString("base64")}` };
  }));
}

export function buildAcpPromptBlocks({ prompt, instructions, references, workspaceRoot }) {
  const content = instructions ? `${instructions}\n\nUser request:\n${prompt}` : prompt;
  const blocks = [{ type: "text", text: content }];
  const seen = new Set();
  for (const reference of array(references)) {
    if (reference?.kind === "staged-attachment") {
      const image = dataUrlParts(reference.snapshotUrl);
      if (!image || !reference.mime?.startsWith("image/") || image.mime !== reference.mime) throw invalidImageError();
      blocks.push({ type: "image", data: image.data, mimeType: image.mime });
      continue;
    }
    const filename = typeof reference?.path === "string" ? path.resolve(reference.path) : null;
    if (!filename || !isInsideWorkspace(workspaceRoot, filename)) {
      throw new Error("ACP received an invalid workspace reference.");
    }
    if (seen.has(filename)) continue;
    seen.add(filename);
    const name = text(reference?.name, 300) || path.basename(filename);
    blocks.push({ type: "resource_link", uri: pathToFileURL(filename).href, name, title: name });
  }
  return blocks;
}

function dataUrlParts(value) {
  if (typeof value !== "string" || value.length > Math.ceil(ACP_INLINE_IMAGE_MAX_BYTES * 4 / 3) + 256) return null;
  const match = /^data:([^;,]{1,160});base64,([A-Za-z0-9+/=]+)$/.exec(value);
  return match ? { mime: match[1], data: match[2] } : null;
}

function isInsideWorkspace(workspaceRoot, filename) {
  const relative = path.relative(workspaceRoot, filename);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function invalidImageError() {
  return new Error("ACP received an invalid staged image reference (possibly oversized).");
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { normalizePackRelativePath } from "./manifest-schema.mjs";

/**
 * Hostile-archive validation for .puppyplugin packages.
 *
 * JSZip normalizes `../` out of entry keys on load, which would hide traversal
 * attacks from a post-load check. We therefore scan the ZIP central directory
 * for raw entry names BEFORE handing bytes to JSZip.
 */

export const VIEWER_PACK_ARCHIVE_LIMITS = Object.freeze({
  maxCompressedBytes: 80 * 1024 * 1024,
  maxEntryCount: 2_000,
  maxExtractedBytes: 250 * 1024 * 1024,
  maxSingleEntryBytes: 64 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxEntryNameLength: 512,
});

const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

export async function extractAndValidateViewerPackArchive({
  archiveBytes,
  destinationDir,
  limits = VIEWER_PACK_ARCHIVE_LIMITS,
}) {
  if (!Buffer.isBuffer(archiveBytes) && !(archiveBytes instanceof Uint8Array)) {
    throw new Error("Archive bytes are required.");
  }
  const compressedBytes = Buffer.byteLength(archiveBytes);
  if (compressedBytes > limits.maxCompressedBytes) {
    throw new Error("Viewer pack archive exceeds compressed size budget.");
  }

  // Fail closed on hostile raw names before JSZip can normalize them away.
  const centralDirectory = assertSafeCentralDirectoryEntryNames(archiveBytes, limits);

  const zip = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
  const names = Object.keys(zip.files);
  if (names.length === 0) throw new Error("Viewer pack archive is empty.");
  if (names.length > limits.maxEntryCount) {
    throw new Error("Viewer pack archive has too many entries.");
  }

  const seenLower = new Set();
  const inventory = [];
  let extractedTotal = 0;

  await fsp.rm(destinationDir, { recursive: true, force: true });
  await fsp.mkdir(destinationDir, { recursive: true, mode: 0o700 });

  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;

    const declared = centralDirectory.get(name);
    if (!declared) throw new Error(`Archive entry missing from central directory: ${name}`);
    if (declared.uncompressedSize > limits.maxSingleEntryBytes) {
      throw new Error(`Archive entry exceeds single-entry size budget: ${name}`);
    }

    if (name.length > limits.maxEntryNameLength) {
      throw new Error(`Archive entry name too long: ${name}`);
    }
    const normalized = normalizePackRelativePath(name);
    if (!normalized.ok) {
      throw new Error(`Archive entry path rejected (${normalized.reason}): ${name}`);
    }
    const lower = normalized.path.toLowerCase();
    if (seenLower.has(lower)) {
      throw new Error(`Duplicate/case-colliding archive entry: ${name}`);
    }
    seenLower.add(lower);

    const unixMode = entry.unixPermissions;
    if (typeof unixMode === "number" && (unixMode & 0o170000) === 0o120000) {
      throw new Error(`Symlink entries are forbidden: ${name}`);
    }

    const bytes = Buffer.from(await entry.async("uint8array"));
    if (bytes.length !== declared.uncompressedSize) {
      throw new Error(`Archive entry size does not match central directory: ${name}`);
    }
    extractedTotal += bytes.length;
    if (extractedTotal > limits.maxExtractedBytes) {
      throw new Error("Viewer pack archive exceeds extracted size budget.");
    }
    if (compressedBytes > 0 && extractedTotal / compressedBytes > limits.maxCompressionRatio) {
      throw new Error("Viewer pack archive compression ratio looks hostile.");
    }

    const targetPath = path.join(destinationDir, ...normalized.path.split("/"));
    const resolvedTarget = path.resolve(targetPath);
    const resolvedRoot = path.resolve(destinationDir);
    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`Archive entry escapes destination: ${name}`);
    }
    await fsp.mkdir(path.dirname(resolvedTarget), { recursive: true, mode: 0o700 });
    await fsp.writeFile(resolvedTarget, bytes, { flag: "wx", mode: 0o600 });

    inventory.push({
      path: normalized.path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
    });
  }

  inventory.sort((a, b) => a.path.localeCompare(b.path));
  return {
    inventory,
    extractedBytes: extractedTotal,
    compressedBytes,
    contentHash: createHash("sha256")
      .update(inventory.map((item) => `${item.path}:${item.sizeBytes}:${item.sha256}`).join("\n"))
      .digest("hex"),
  };
}

/**
 * Scan ZIP central-directory entry names without decompressing. Rejects
 * traversal, absolute, drive-letter, backslash, and empty-segment names that
 * JSZip would otherwise normalize into a seemingly-safe key.
 */
export function assertSafeCentralDirectoryEntryNames(archiveBytes, limits = VIEWER_PACK_ARCHIVE_LIMITS) {
  const bytes = Buffer.from(archiveBytes);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new Error("Archive entry path rejected (missing-eocd): end of central directory not found.");
  }
  const commentLength = bytes.readUInt16LE(eocdOffset + 20);
  if (eocdOffset + 22 + commentLength !== bytes.length) {
    throw new Error("Archive entry path rejected (trailing-data-or-invalid-comment).");
  }

  const diskNumber = bytes.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocdOffset + 8);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectoryBytes = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralDirectoryBytes === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error("Archive entry path rejected (multi-disk-or-zip64-unsupported).");
  }
  if (entryCount > limits.maxEntryCount) {
    throw new Error("Viewer pack archive has too many entries.");
  }
  if (centralDirectoryOffset + centralDirectoryBytes > bytes.length) {
    throw new Error("Archive entry path rejected (central-directory-bounds).");
  }
  if (centralDirectoryOffset + centralDirectoryBytes !== eocdOffset) {
    throw new Error("Archive entry path rejected (central-directory-not-contiguous).");
  }

  let cursor = centralDirectoryOffset;
  const centralEnd = centralDirectoryOffset + centralDirectoryBytes;
  const entries = new Map();
  let declaredExtractedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd) {
      throw new Error("Archive entry path rejected (truncated-central-directory).");
    }
    if (bytes.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error("Archive entry path rejected (bad-central-directory-signature).");
    }
    const filenameBytes = bytes.readUInt16LE(cursor + 28);
    const extraBytes = bytes.readUInt16LE(cursor + 30);
    const commentBytes = bytes.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + filenameBytes;
    if (nameEnd + extraBytes + commentBytes > centralEnd) {
      throw new Error("Archive entry path rejected (truncated-entry-name).");
    }
    const rawName = bytes.subarray(nameStart, nameEnd).toString("utf8");
    assertRawZipEntryName(rawName, limits);
    const flags = bytes.readUInt16LE(cursor + 8);
    const compressionMethod = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const madeByPlatform = bytes.readUInt16LE(cursor + 4) >> 8;
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const unixMode = externalAttributes >>> 16;
    if (madeByPlatform === 3 && (unixMode & 0o170000) === 0o120000) {
      throw new Error(`Archive entry path rejected (symlink-entry): ${rawName}`);
    }
    if ((flags & 0x1) !== 0) {
      throw new Error(`Archive entry path rejected (encrypted-entry): ${rawName}`);
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(`Archive entry path rejected (unsupported-compression): ${rawName}`);
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error(`Archive entry path rejected (zip64-entry-unsupported): ${rawName}`);
    }
    if (!rawName.endsWith("/")) {
      if (uncompressedSize > limits.maxSingleEntryBytes) {
        throw new Error(`Archive entry exceeds single-entry size budget: ${rawName}`);
      }
      if (compressedSize === 0 && uncompressedSize > 0) {
        throw new Error(`Archive entry compression ratio looks hostile: ${rawName}`);
      }
      if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
        throw new Error(`Archive entry compression ratio looks hostile: ${rawName}`);
      }
      declaredExtractedTotal += uncompressedSize;
      if (declaredExtractedTotal > limits.maxExtractedBytes) {
        throw new Error("Viewer pack archive exceeds declared extracted size budget.");
      }
    }
    if (entries.has(rawName)) {
      throw new Error(`Duplicate archive entry: ${rawName}`);
    }
    entries.set(rawName, { compressedSize, uncompressedSize, flags, compressionMethod });
    cursor = nameEnd + extraBytes + commentBytes;
  }
  if (cursor !== centralEnd) {
    throw new Error("Archive entry path rejected (central-directory-length-mismatch).");
  }
  return entries;
}

function assertRawZipEntryName(name, limits) {
  if (!name || name.length > limits.maxEntryNameLength) {
    throw new Error(`Archive entry path rejected (empty-or-too-long): ${name || "(empty)"}`);
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error(`Archive entry path rejected (control-chars): ${name}`);
  }
  if (name.startsWith("/") || name.startsWith("\\") || name.includes("\\") || /^[a-z]:/i.test(name)) {
    throw new Error(`Archive entry path rejected (absolute-or-drive): ${name}`);
  }
  const withoutTrailingSlash = name.endsWith("/") ? name.slice(0, -1) : name;
  const segments = withoutTrailingSlash.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Archive entry path rejected (traversal): ${name}`);
  }
}

function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - (0xffff + 22));
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

export function assertManifestInventory(manifest, inventory) {
  const entry = manifest.viewer.entry;
  if (!inventory.some((item) => item.path === entry)) {
    throw new Error(`Package entry missing from inventory: ${entry}`);
  }
  if (!inventory.some((item) => item.path === "manifest.json")) {
    throw new Error("manifest.json missing from extracted inventory.");
  }
}

export function readFileIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

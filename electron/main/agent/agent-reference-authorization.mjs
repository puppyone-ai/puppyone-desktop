import fs from "node:fs";
import path from "node:path";

const MAX_REFERENCES = 32;
const MAX_REFERENCE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_REFERENCE_BYTES = 25 * 1024 * 1024;

/**
 * Turn renderer path hints into short-lived, main-process-authorized file
 * references. The resolved target must remain inside the already-authorized
 * workspace after symlinks are resolved.
 */
export async function authorizeAgentReferences({
  workspaceRoot,
  references,
  budget = createAgentReferenceBudget(),
  fsModule = fs,
}) {
  if (!Array.isArray(references) || references.length === 0) return [];
  assertReferenceBudget(budget);
  const canonicalRoot = await fsModule.promises.realpath(path.resolve(workspaceRoot));
  const authorized = [];
  const seen = new Set();
  let totalBytes = 0;

  for (const reference of references.slice(0, MAX_REFERENCES)) {
    const requestedPath = typeof reference === "string" ? reference : reference?.path;
    if (typeof requestedPath !== "string" || !path.isAbsolute(requestedPath)) {
      throw new Error("Agent file references must use an absolute workspace path.");
    }
    const canonicalPath = await fsModule.promises.realpath(path.resolve(requestedPath)).catch(() => {
      throw new Error("An Agent file reference no longer exists.");
    });
    if (!isSameOrInsidePath(canonicalRoot, canonicalPath)) {
      throw new Error("Agent file references must stay inside the assigned workspace.");
    }
    if (seen.has(canonicalPath)) continue;
    if (budget.remainingReferences <= 0) {
      throw new Error("Agent file references exceed the 32-file safety limit.");
    }
    const flags = fsModule.constants.O_RDONLY | (fsModule.constants.O_NOFOLLOW ?? 0);
    const handle = await fsModule.promises.open(canonicalPath, flags).catch(() => {
      throw new Error("An Agent file reference changed while it was being authorized.");
    });
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) throw new Error("Agent file references must be regular files.");
      if (metadata.size > MAX_REFERENCE_BYTES) {
        throw new Error("An Agent file reference exceeds the 25 MB safety limit.");
      }
      if (totalBytes + metadata.size > MAX_TOTAL_REFERENCE_BYTES || metadata.size > budget.remainingBytes) {
        throw new Error("Agent file references exceed the 25 MB total safety limit.");
      }
      const bytes = await handle.readFile();
      if (bytes.byteLength !== metadata.size) {
        throw new Error("An Agent file reference changed while it was being authorized.");
      }
      const mime = inferMimeType(canonicalPath);
      totalBytes += bytes.byteLength;
      budget.remainingBytes -= bytes.byteLength;
      budget.remainingReferences -= 1;
      seen.add(canonicalPath);
      authorized.push({
        authorized: true,
        path: canonicalPath,
        name: path.basename(canonicalPath),
        mime,
        size: bytes.byteLength,
        snapshotUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      });
    } finally {
      await handle.close();
    }
  }
  return authorized;
}

export function createAgentReferenceBudget() {
  return {
    remainingBytes: MAX_TOTAL_REFERENCE_BYTES,
    remainingReferences: MAX_REFERENCES,
  };
}

function assertReferenceBudget(budget) {
  if (
    !budget
    || !Number.isSafeInteger(budget.remainingBytes)
    || budget.remainingBytes < 0
    || budget.remainingBytes > MAX_TOTAL_REFERENCE_BYTES
    || !Number.isSafeInteger(budget.remainingReferences)
    || budget.remainingReferences < 0
    || budget.remainingReferences > MAX_REFERENCES
  ) {
    throw new Error("Agent file reference budget is invalid.");
  }
}

function isSameOrInsidePath(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function inferMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION.get(extension) || "application/octet-stream";
}

const MIME_BY_EXTENSION = new Map([
  [".md", "text/markdown"],
  [".mdx", "text/markdown"],
  [".txt", "text/plain"],
  [".json", "application/json"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".cjs", "text/javascript"],
  [".ts", "text/typescript"],
  [".tsx", "text/typescript"],
  [".jsx", "text/javascript"],
  [".css", "text/css"],
  [".html", "text/html"],
  [".xml", "application/xml"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
  [".csv", "text/csv"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".pdf", "application/pdf"],
]);

export const agentReferenceLimits = Object.freeze({
  maxReferences: MAX_REFERENCES,
  maxReferenceBytes: MAX_REFERENCE_BYTES,
  maxTotalReferenceBytes: MAX_TOTAL_REFERENCE_BYTES,
});

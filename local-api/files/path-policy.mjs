import fs from "node:fs/promises";
import path from "node:path";

export function normalizeRelativePath(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    throw new Error("Folder path must be a string.");
  }
  if (path.isAbsolute(value)) {
    throw new Error("Folder path is outside the selected workspace.");
  }
  const normalized = path.normalize(value).replaceAll("\\", "/");
  if (normalized === "." || normalized === "") return "";
  if (normalized.startsWith("../") || normalized === ".." || normalized.includes("/../")) {
    throw new Error("Folder path is outside the selected workspace.");
  }
  return normalized;
}

export function isSameOrInsidePath(parentPath, candidatePath) {
  const parent = path.resolve(parentPath);
  const candidate = path.resolve(candidatePath);
  if (candidate === parent) return true;

  const relativePath = path.relative(parent, candidate);
  return Boolean(relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function resolveWorkspacePath(rootPath, relativePath) {
  const root = path.resolve(rootPath);
  const normalizedRelative = normalizeRelativePath(relativePath);
  const resolved = normalizedRelative ? path.resolve(root, normalizedRelative) : root;
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Folder path is outside the selected workspace.");
  }
  return resolved;
}

export async function resolveExistingWorkspacePath(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath);
  const canonicalRoot = await fs.realpath(resolvedRoot).catch((error) => {
    throw new Error(`Unable to resolve workspace root: ${error.message}`);
  });
  const candidatePath = resolveWorkspacePath(canonicalRoot, relativePath);
  const candidateMetadata = await fs.lstat(candidatePath).catch((error) => {
    throw new Error(`Unable to resolve workspace entry: ${error.message}`);
  });

  if (candidatePath !== canonicalRoot && candidateMetadata.isSymbolicLink()) {
    throw new Error("Symbolic links cannot be accessed through workspace file operations.");
  }

  const canonicalCandidate = await fs.realpath(candidatePath).catch((error) => {
    throw new Error(`Unable to resolve workspace entry: ${error.message}`);
  });
  if (!isSameOrInsidePath(canonicalRoot, canonicalCandidate)) {
    throw new Error("Workspace entry resolves outside the selected workspace.");
  }

  return canonicalCandidate;
}

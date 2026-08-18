import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_ACTIVITY_LIMITS } from "../../../../shared/agent-activity-contract/constants.mjs";

const WRITE_LIKE_ACCESS = new Set(["write", "delete", "move-from", "move-to"]);

export async function resolvePublicActivityTarget({
  candidate,
  cwd,
  workspaceRoot,
  fsService = fs,
  platform = process.platform,
}) {
  if (!isSafePath(candidate?.path) || !isSafePath(cwd) || !path.isAbsolute(workspaceRoot)) {
    return null;
  }
  const pathModule = platform === "win32" ? path.win32 : path;
  const absoluteCandidate = pathModule.isAbsolute(candidate.path)
    ? pathModule.normalize(candidate.path)
    : pathModule.resolve(cwd, candidate.path);

  const canonicalTarget = await canonicalizeTarget({
    absoluteCandidate,
    access: candidate.access,
    fsService,
    pathModule,
  });
  if (!canonicalTarget || !isContained(workspaceRoot, canonicalTarget, pathModule, platform)) {
    return null;
  }
  const relative = pathModule.relative(workspaceRoot, canonicalTarget);
  if (!relative || relative === "." || !isSafeRelative(relative, pathModule)) return null;
  return Object.freeze({
    workspaceRelativePath: relative.split(pathModule.sep).join("/"),
    access: candidate.access,
    confidence: candidate.confidence,
  });
}

async function canonicalizeTarget({ absoluteCandidate, access, fsService, pathModule }) {
  try {
    return await fsService.realpath(absoluteCandidate);
  } catch {
    if (!WRITE_LIKE_ACCESS.has(access)) return null;
  }

  const missingSegments = [];
  let cursor = absoluteCandidate;
  while (true) {
    const parent = pathModule.dirname(cursor);
    if (parent === cursor) return null;
    missingSegments.unshift(pathModule.basename(cursor));
    cursor = parent;
    try {
      const canonicalParent = await fsService.realpath(cursor);
      return pathModule.join(canonicalParent, ...missingSegments);
    } catch {
      // Keep walking until an existing ancestor establishes the symlink boundary.
    }
  }
}

function isContained(root, target, pathModule, platform) {
  const relative = pathModule.relative(root, target);
  if (relative === "") return true;
  if (relative === ".." || relative.startsWith(`..${pathModule.sep}`) || pathModule.isAbsolute(relative)) {
    return false;
  }
  if (platform !== "win32") return true;
  const normalizedRoot = pathModule.resolve(root).toLowerCase();
  const normalizedTarget = pathModule.resolve(target).toLowerCase();
  return normalizedTarget === normalizedRoot
    || normalizedTarget.startsWith(`${normalizedRoot}${pathModule.sep}`);
}

function isSafeRelative(value, pathModule) {
  return value !== ".."
    && !value.startsWith(`..${pathModule.sep}`)
    && !pathModule.isAbsolute(value)
    && isSafePath(value);
}

function isSafePath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= AGENT_ACTIVITY_LIMITS.pathLength
    && !/[\0-\x1f\x7f]/u.test(value);
}

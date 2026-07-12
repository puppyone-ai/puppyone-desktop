import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROJECT_INSTRUCTION_NAMES = Object.freeze(["AGENTS.md", "CONTEXT.md"]);
const MAX_PROJECT_INSTRUCTION_BYTES = 256 * 1024;

/**
 * Native backends' automatic project-config walks are disabled at their
 * adapters. This is the narrow main-owned replacement: one known filename,
 * one canonical workspace, no external symlink target, and a strict byte
 * limit. The backend's own system prompt remains authoritative.
 */
export async function loadAuthorizedProjectInstructions(workspaceRoot, {
  fsModule = fs,
  instructionNames = DEFAULT_PROJECT_INSTRUCTION_NAMES,
} = {}) {
  const canonicalRoot = await fsModule.promises.realpath(path.resolve(workspaceRoot));
  for (const name of normalizeInstructionNames(instructionNames)) {
    const requestedPath = path.join(canonicalRoot, name);
    let canonicalPath;
    try {
      canonicalPath = await fsModule.promises.realpath(requestedPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!isSameOrInsidePath(canonicalRoot, canonicalPath)) {
      throw new Error(`${name} resolves outside the authorized workspace.`);
    }
    const flags = fsModule.constants.O_RDONLY | (fsModule.constants.O_NOFOLLOW ?? 0);
    const handle = await fsModule.promises.open(canonicalPath, flags).catch(() => {
      throw new Error(`${name} changed while it was being authorized.`);
    });
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) throw new Error(`${name} must resolve to a regular file.`);
      if (metadata.size > MAX_PROJECT_INSTRUCTION_BYTES) {
        throw new Error(`${name} exceeds the 256 KB project-instruction limit.`);
      }
      const text = await handle.readFile("utf8");
      if (text.includes("\0")) throw new Error(`${name} is not a valid text instruction file.`);
      return {
        source: name,
        text,
        bytes: Buffer.byteLength(text, "utf8"),
      };
    } finally {
      await handle.close();
    }
  }
  return null;
}

export function formatAuthorizedProjectInstructions(instructions) {
  if (!instructions?.text?.trim()) return undefined;
  return [
    `PuppyOne main process authorized project instructions from ${instructions.source}.`,
    "These instructions are workspace content; runtime tool permissions still apply.",
    "",
    instructions.text,
  ].join("\n");
}

function isSameOrInsidePath(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export const authorizedProjectInstructionPolicy = Object.freeze({
  defaultFilenames: DEFAULT_PROJECT_INSTRUCTION_NAMES,
  maxBytes: MAX_PROJECT_INSTRUCTION_BYTES,
});

function normalizeInstructionNames(value) {
  if (!Array.isArray(value)) throw new TypeError("Project instruction names must be an array.");
  return value.slice(0, 8).map((name) => {
    if (typeof name !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(name)) {
      throw new TypeError("Project instruction filename is invalid.");
    }
    return name;
  });
}

import fs from "node:fs";
import path from "node:path";

/**
 * Creates the sole renderer workspace-root authorization capability. The
 * renderer may repeat its expected root, but it cannot mint authority: the
 * root comes from main-process window state and both sides are realpathed.
 */
export function createSenderWorkspaceAuthorization({
  getWorkspaceRootForSender,
  fsModule = fs,
}) {
  if (typeof getWorkspaceRootForSender !== "function") {
    throw new TypeError("getWorkspaceRootForSender is required.");
  }

  return async function authorizeWorkspaceRoot(event, requestedRoot = undefined) {
    const sender = event?.sender;
    if (!sender) {
      throw new Error("Workspace IPC sender is invalid.");
    }

    const assignedRoot = await getWorkspaceRootForSender(sender);
    if (typeof assignedRoot !== "string" || assignedRoot.trim().length === 0) {
      throw new Error("No local workspace is assigned to this window.");
    }

    const canonicalAssignedRoot = await canonicalizeExistingDirectory(
      assignedRoot,
      "Unable to resolve the window workspace",
      fsModule,
    );

    if (requestedRoot === undefined || requestedRoot === null) {
      return canonicalAssignedRoot;
    }
    if (typeof requestedRoot !== "string" || requestedRoot.trim().length === 0) {
      throw new Error("Workspace root path must be a non-empty string.");
    }

    const canonicalRequestedRoot = await canonicalizeExistingDirectory(
      requestedRoot,
      "Unable to resolve the requested workspace root",
      fsModule,
    );
    if (path.relative(canonicalAssignedRoot, canonicalRequestedRoot) !== "") {
      throw new Error("Requested workspace root does not match the workspace assigned to this window.");
    }

    return canonicalAssignedRoot;
  };
}

/** Resolve an existing working directory and prove its real path stays rooted. */
export async function resolveCanonicalWorkspaceDirectory(
  rootValue,
  directoryValue,
  { fsModule = fs, label = "Working directory" } = {},
) {
  const canonicalRoot = await canonicalizeExistingDirectory(
    rootValue,
    "Unable to resolve the workspace root",
    fsModule,
  );
  if (typeof directoryValue !== "string" || directoryValue.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  const candidate = path.isAbsolute(directoryValue)
    ? path.resolve(directoryValue)
    : path.resolve(canonicalRoot, directoryValue);
  const canonicalDirectory = await canonicalizeExistingDirectory(
    candidate,
    `Unable to resolve ${label.toLowerCase()}`,
    fsModule,
  );
  if (!isSameOrInsidePath(canonicalRoot, canonicalDirectory)) {
    throw new Error(`${label} must stay inside the assigned workspace.`);
  }
  return canonicalDirectory;
}

async function canonicalizeExistingDirectory(value, prefix, fsModule) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${prefix}: path is required.`);
  }
  const canonicalPath = await fsModule.promises.realpath(path.resolve(value)).catch((error) => {
    throw new Error(`${prefix}: ${error.message}`);
  });
  const metadata = await fsModule.promises.stat(canonicalPath).catch((error) => {
    throw new Error(`${prefix}: ${error.message}`);
  });
  if (!metadata.isDirectory()) {
    throw new Error(`${prefix}: path is not a directory.`);
  }
  return canonicalPath;
}

function isSameOrInsidePath(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

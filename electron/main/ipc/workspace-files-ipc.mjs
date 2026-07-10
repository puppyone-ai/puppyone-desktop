import path from "node:path";
import {
  copyWorkspaceEntry,
  createWorkspaceEntry,
  convertWorkspaceOfficeDocumentToDocx,
  deleteWorkspaceEntry,
  getMimeType,
  importWorkspaceEntries,
  listFolderChildren,
  moveWorkspaceEntry,
  readWorkspaceTextFile,
  renameWorkspaceEntry,
  resolveExistingWorkspacePath,
  writeWorkspaceTextFile,
} from "../../../local-api/workspace.mjs";
import { absorbWorkspaceEditReviewPath } from "../../../local-api/edit-review.mjs";
import {
  chooseExternalApplication,
  listExternalOpenTargets,
  openFileWithExternalApplication,
  resolveExternalOpenTarget,
  validateExternalApplicationPath,
} from "../external-apps.mjs";
import { isPotentiallyExecutableFile } from "../security.mjs";
import { buildLocalFileCapabilityUrl } from "../local-file-capabilities.mjs";
import { parseLocalFileUrl } from "../local-file-protocol.mjs";

const MAX_OFFICE_CONVERSIONS_PER_WINDOW = 2;

export function registerWorkspaceFileIpcHandlers({
  app,
  ipcMain,
  BrowserWindow,
  dialog,
  fs,
  shell,
  authorizeWorkspaceRoot,
  localFileCapabilities,
  convertOfficeDocument = convertWorkspaceOfficeDocumentToDocx,
}) {
  const officeConversionSessionsBySender = new Map();

  ipcMain.handle("workspace:list-folder-children", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const folderPath = request?.folderPath ?? null;
    return listFolderChildren(rootPath, folderPath);
  });

  ipcMain.handle("workspace:read-file", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const filePath = request?.path;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    return readWorkspaceTextFile(rootPath, filePath);
  });

  ipcMain.handle("workspace:get-file-url", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const filePath = request?.path;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    const canonicalFilePath = await resolveExistingWorkspacePath(rootPath, filePath);
    const metadata = await fs.promises.stat(canonicalFilePath).catch((error) => {
      throw new Error(`Unable to resolve local file resource: ${error.message}`);
    });
    if (!metadata.isFile()) throw new Error("Local file resource must be a regular file.");

    const relativePath = path.relative(rootPath, canonicalFilePath).split(path.sep).join("/");
    const purpose = requireLocalFileCapabilityPurpose(request?.purpose);
    const scope = purpose === "file-preview" && getMimeType(canonicalFilePath)?.toLowerCase().startsWith("text/html")
      ? "directory"
      : "exact";
    const token = localFileCapabilities.issue({
      senderId: requireIpcSenderId(event),
      rootPath,
      relativePath,
      scope,
      purpose,
      reuse: false,
    });
    return {
      url: buildLocalFileCapabilityUrl({ rootPath, relativePath, token, purpose }),
    };
  });

  ipcMain.handle("workspace:revoke-file-url", async (event, request) => {
    if (typeof request?.url !== "string" || request.url.length > 16_384) {
      return { revoked: false };
    }
    let parsed;
    try {
      parsed = parseLocalFileUrl(request.url);
    } catch {
      return { revoked: false };
    }
    return {
      revoked: localFileCapabilities.revoke({
        token: parsed.token,
        senderId: requireIpcSenderId(event),
      }),
    };
  });

  ipcMain.handle("workspace:convert-office-docx", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const filePath = request?.path;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    const requestId = requireOfficeConversionRequestId(request?.requestId);
    const senderId = requireIpcSenderId(event);
    let senderSessions = officeConversionSessionsBySender.get(senderId);
    if (!senderSessions) {
      senderSessions = new Map();
      officeConversionSessionsBySender.set(senderId, senderSessions);
    }
    if (senderSessions.has(requestId)) {
      throw new Error("An Office conversion with this request id is already running.");
    }
    if (senderSessions.size >= MAX_OFFICE_CONVERSIONS_PER_WINDOW) {
      throw new Error(`Only ${MAX_OFFICE_CONVERSIONS_PER_WINDOW} Office conversions may run in one window at a time.`);
    }

    const controller = new AbortController();
    const session = { controller, requestId };
    const abortWhenSenderCloses = () => controller.abort();
    event.sender.once?.("destroyed", abortWhenSenderCloses);
    senderSessions.set(requestId, session);

    try {
      return await convertOfficeDocument(rootPath, filePath, { signal: controller.signal });
    } finally {
      event.sender.removeListener?.("destroyed", abortWhenSenderCloses);
      if (senderSessions.get(requestId) === session) {
        senderSessions.delete(requestId);
      }
      if (senderSessions.size === 0 && officeConversionSessionsBySender.get(senderId) === senderSessions) {
        officeConversionSessionsBySender.delete(senderId);
      }
    }
  });

  ipcMain.handle("workspace:convert-office-docx-cancel", async (event, request) => {
    const requestId = requireOfficeConversionRequestId(request?.requestId);
    const senderId = requireIpcSenderId(event);
    const session = officeConversionSessionsBySender.get(senderId)?.get(requestId) ?? null;
    if (!session) return { cancelled: false };

    session.controller.abort();
    return { cancelled: true };
  });

  ipcMain.handle("workspace:write-file", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const filePath = request?.path;
    const content = request?.content;
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    await writeWorkspaceTextFile(rootPath, filePath, content);
    await absorbWorkspaceEditReviewPath(rootPath, filePath);
  });

  ipcMain.handle("workspace:create-entry", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const result = await createWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:rename-entry", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const previousPath = request?.path;
    const result = await renameWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, previousPath);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:move-entry", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const previousPath = request?.fromPath;
    const result = await moveWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, previousPath);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:copy-entry", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const result = await copyWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:import-entries", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const result = await importWorkspaceEntries(rootPath, request);
    await Promise.all(result.paths.map((importedPath) => absorbWorkspaceEditReviewPath(rootPath, importedPath)));
    return result;
  });

  ipcMain.handle("workspace:delete-entry", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const result = await deleteWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:reveal-entry-in-finder", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const entryPath = request?.path;
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }
    if (request?.strategy && request.strategy !== "system") {
      throw new Error("Unsupported external app opening strategy.");
    }

    const targetPath = await resolveExistingWorkspacePath(rootPath, entryPath);
    await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to reveal entry in Finder: ${error.message}`);
    });
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:open-entry-external", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const entryPath = request?.path;
    const strategy = request?.strategy ?? "system";
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }
    if (strategy !== "system" && strategy !== "app") {
      throw new Error("Unsupported external app opening strategy.");
    }

    let targetPath = await resolveExistingWorkspacePath(rootPath, entryPath);
    let stats = await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to open entry: ${error.message}`);
    });
    if (!stats.isFile()) {
      throw new Error("Only files can be opened in another app.");
    }

    if (isPotentiallyExecutableFile(targetPath, stats)) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const confirmOptions = {
        type: "warning",
        buttons: ["Open", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Open executable file?",
        message: `Open "${path.basename(targetPath)}" in another app?`,
        detail: "This file type may run code or install software. Only open it if you trust this workspace.",
      };
      const result = window
        ? await dialog.showMessageBox(window, confirmOptions)
        : await dialog.showMessageBox(confirmOptions);
      if (result.response !== 0) return { ok: false, cancelled: true };
    }

    // The user may spend an arbitrary amount of time in the confirmation
    // dialog. Resolve and stat again so a swapped symlink/path is not opened.
    targetPath = await resolveExistingWorkspacePath(rootPath, entryPath);
    stats = await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to revalidate entry before opening: ${error.message}`);
    });
    if (!stats.isFile()) {
      throw new Error("Only files can be opened in another app.");
    }

    if (strategy === "app") {
      await openFileWithExternalApplication({
        appPath: request?.appPath,
        filePath: targetPath,
      });
      return { ok: true };
    }

    const openError = await shell.openPath(targetPath);
    if (openError) {
      throw new Error(openError);
    }
    return { ok: true };
  });

  ipcMain.handle("workspace:resolve-external-open-target", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const entryPath = request?.path;
    const overrideAppPath = typeof request?.overrideAppPath === "string"
      ? request.overrideAppPath.trim()
      : "";
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }

    const targetPath = await resolveExistingWorkspacePath(rootPath, entryPath);
    const stats = await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to resolve external app: ${error.message}`);
    });
    if (!stats.isFile()) {
      throw new Error("Only files can be opened in another app.");
    }

    if (overrideAppPath) validateExternalApplicationPath(overrideAppPath);

    return resolveExternalOpenTarget({
      app,
      appPath: overrideAppPath || null,
      extension: normalizeFileExtension(request?.extension ?? path.extname(targetPath)),
      filePath: targetPath,
      source: overrideAppPath ? "override" : "system",
    });
  });

  ipcMain.handle("workspace:list-external-open-targets", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    const entryPath = request?.path;
    const overrideAppPath = typeof request?.overrideAppPath === "string"
      ? request.overrideAppPath.trim()
      : "";
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }

    const targetPath = await resolveExistingWorkspacePath(rootPath, entryPath);
    const stats = await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to resolve external apps: ${error.message}`);
    });
    if (!stats.isFile()) {
      throw new Error("Only files can be opened in another app.");
    }

    if (overrideAppPath) validateExternalApplicationPath(overrideAppPath);

    return listExternalOpenTargets({
      app,
      appPath: overrideAppPath || null,
      extension: normalizeFileExtension(request?.extension ?? path.extname(targetPath)),
      filePath: targetPath,
    });
  });

  ipcMain.handle("workspace:choose-external-app", async (event, request) => {
    const extension = normalizeFileExtension(request?.extension);
    return chooseExternalApplication({
      app,
      dialog,
      ownerWindow: BrowserWindow.fromWebContents(event.sender),
      extension,
    });
  });
}

function requireOfficeConversionRequestId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error("Office conversion request id is invalid.");
  }
  return value;
}

function requireIpcSenderId(event) {
  const senderId = event?.sender?.id;
  if (!Number.isSafeInteger(senderId) || senderId <= 0) {
    throw new Error("Office conversion sender is invalid.");
  }
  return senderId;
}

function requireLocalFileCapabilityPurpose(value) {
  if (value === undefined || value === "file-preview") return "file-preview";
  if (value === "markdown-asset") return value;
  throw new Error("Local file capability purpose is invalid.");
}

function normalizeFileExtension(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^\*?\./, "");
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized) ? normalized : null;
}

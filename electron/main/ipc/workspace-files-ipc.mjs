import path from "node:path";
import {
  createWorkspaceEntry,
  convertWorkspaceOfficeDocumentToDocx,
  deleteWorkspaceEntry,
  importWorkspaceEntries,
  listFolderChildren,
  moveWorkspaceEntry,
  readWorkspaceTextFile,
  renameWorkspaceEntry,
  resolveWorkspacePath,
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

export function registerWorkspaceFileIpcHandlers({
  app,
  ipcMain,
  BrowserWindow,
  dialog,
  fs,
  shell,
}) {
  ipcMain.handle("workspace:list-folder-children", async (_event, request) => {
    const rootPath = request?.rootPath;
    const folderPath = request?.folderPath ?? null;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    return listFolderChildren(rootPath, folderPath);
  });

  ipcMain.handle("workspace:read-file", async (_event, request) => {
    const rootPath = request?.rootPath;
    const filePath = request?.path;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    return readWorkspaceTextFile(rootPath, filePath);
  });

  ipcMain.handle("workspace:convert-office-docx", async (_event, request) => {
    const rootPath = request?.rootPath;
    const filePath = request?.path;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    return convertWorkspaceOfficeDocumentToDocx(rootPath, filePath);
  });

  ipcMain.handle("workspace:write-file", async (_event, request) => {
    const rootPath = request?.rootPath;
    const filePath = request?.path;
    const content = request?.content;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof filePath !== "string" || filePath.trim().length === 0) {
      throw new Error("File path is required.");
    }
    await writeWorkspaceTextFile(rootPath, filePath, content);
    await absorbWorkspaceEditReviewPath(rootPath, filePath);
  });

  ipcMain.handle("workspace:create-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const result = await createWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:rename-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const previousPath = request?.path;
    const result = await renameWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, previousPath);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:move-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const previousPath = request?.fromPath;
    const result = await moveWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, previousPath);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:import-entries", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const result = await importWorkspaceEntries(rootPath, request);
    await Promise.all(result.paths.map((importedPath) => absorbWorkspaceEditReviewPath(rootPath, importedPath)));
    return result;
  });

  ipcMain.handle("workspace:delete-entry", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    const result = await deleteWorkspaceEntry(rootPath, request);
    await absorbWorkspaceEditReviewPath(rootPath, result.path);
    return result;
  });

  ipcMain.handle("workspace:reveal-entry-in-finder", async (_event, request) => {
    const rootPath = request?.rootPath;
    const entryPath = request?.path;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }
    if (request?.strategy && request.strategy !== "system") {
      throw new Error("Unsupported external app opening strategy.");
    }

    const targetPath = resolveWorkspacePath(rootPath, entryPath);
    await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to reveal entry in Finder: ${error.message}`);
    });
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:open-entry-external", async (event, request) => {
    const rootPath = request?.rootPath;
    const entryPath = request?.path;
    const strategy = request?.strategy ?? "system";
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }
    if (strategy !== "system" && strategy !== "app") {
      throw new Error("Unsupported external app opening strategy.");
    }

    const targetPath = resolveWorkspacePath(rootPath, entryPath);
    const stats = await fs.promises.stat(targetPath).catch((error) => {
      throw new Error(`Unable to open entry: ${error.message}`);
    });
    if (!stats.isFile()) {
      throw new Error("Only files can be opened in another app.");
    }

    if (request?.confirmExecutableFiles !== false && isPotentiallyExecutableFile(targetPath, stats)) {
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

  ipcMain.handle("workspace:resolve-external-open-target", async (_event, request) => {
    const rootPath = request?.rootPath;
    const entryPath = request?.path;
    const overrideAppPath = typeof request?.overrideAppPath === "string"
      ? request.overrideAppPath.trim()
      : "";
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }

    const targetPath = resolveWorkspacePath(rootPath, entryPath);
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

  ipcMain.handle("workspace:list-external-open-targets", async (_event, request) => {
    const rootPath = request?.rootPath;
    const entryPath = request?.path;
    const overrideAppPath = typeof request?.overrideAppPath === "string"
      ? request.overrideAppPath.trim()
      : "";
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
      throw new Error("Entry path is required.");
    }

    const targetPath = resolveWorkspacePath(rootPath, entryPath);
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

function normalizeFileExtension(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/^\*?\./, "");
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized) ? normalized : null;
}

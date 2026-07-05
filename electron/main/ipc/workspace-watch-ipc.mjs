import {
  getLatestWorkspaceEditReviewRequest,
  initializeWorkspaceEditReview,
} from "../../../local-api/edit-review.mjs";

export function registerWorkspaceWatchIpcHandlers({ ipcMain, workspaceWatchService }) {
  ipcMain.handle("workspace:watch-start", async (event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    workspaceWatchService.start(event.sender, rootPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:watch-stop", async (event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    workspaceWatchService.stop(event.sender.id, rootPath);
    return { ok: true };
  });

  ipcMain.handle("ai-edit-review:get-latest", async (_event, request) => {
    const rootPath = request?.rootPath;
    if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
      throw new Error("Workspace root path is required.");
    }
    await initializeWorkspaceEditReview(rootPath);
    return getLatestWorkspaceEditReviewRequest(rootPath);
  });
}

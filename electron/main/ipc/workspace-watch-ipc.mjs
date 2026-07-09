import {
  getLatestWorkspaceEditReviewRequest,
  initializeWorkspaceEditReview,
} from "../../../local-api/edit-review.mjs";

export function registerWorkspaceWatchIpcHandlers({
  ipcMain,
  workspaceWatchService,
  authorizeWorkspaceRoot,
}) {
  ipcMain.handle("workspace:watch-start", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    workspaceWatchService.start(event.sender, rootPath);
    return { ok: true };
  });

  ipcMain.handle("workspace:watch-stop", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    workspaceWatchService.stop(event.sender.id, rootPath);
    return { ok: true };
  });

  ipcMain.handle("ai-edit-review:get-latest", async (event, request) => {
    const rootPath = await authorizeWorkspaceRoot(event, request?.rootPath);
    await initializeWorkspaceEditReview(rootPath);
    return getLatestWorkspaceEditReviewRequest(rootPath);
  });
}

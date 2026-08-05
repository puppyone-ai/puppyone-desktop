#!/usr/bin/env electron

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, session, shell, WebContentsView } from "electron";
import { createAppPreviewRuntime } from "../electron/app-preview-runtime.mjs";
import { createAppPreviewBrowserSurfaceManager } from "../electron/main/app-preview-browser-surface.mjs";
import { createAppPreviewService } from "../electron/main/app-preview-service.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "puppyone-app-preview-smoke-"));
const userDataPath = path.join(tempRoot, "user-data");
const workspacePath = path.join(tempRoot, "workspace");
const manifestPath = "smoke.puppyoneapp";
fs.mkdirSync(userDataPath, { recursive: true });
fs.mkdirSync(workspacePath, { recursive: true });
fs.writeFileSync(path.join(workspacePath, "server.mjs"), `
  import http from "node:http";
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Preview smoke</title><main>ready</main>");
  });
  server.listen(Number(process.env.PORT), process.env.HOST);
`, "utf8");
fs.writeFileSync(path.join(workspacePath, manifestPath), JSON.stringify({
  type: "puppyone.app",
  version: 1,
  name: "App Preview smoke",
  launch: {
    kind: "local-server",
    command: ["node", "server.mjs"],
    cwd: ".",
    env: {},
    url: "http://127.0.0.1:${port}/",
    health: { path: "/", expectStatus: 200 },
  },
  permissions: { workspace: ["read"] },
}, null, 2), "utf8");
app.setPath("userData", userDataPath);

let ownerWindow = null;
let previewService = null;
const createdViews = [];

function TrackingWebContentsView(options) {
  const view = new WebContentsView(options);
  createdViews.push(view);
  return view;
}

async function runSmoke() {
  console.log("App Preview smoke: Electron ready");
  ownerWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await ownerWindow.loadURL("data:text/html,<title>App Preview smoke owner</title>");

  const browserSurfaces = createAppPreviewBrowserSurfaceManager({
    WebContentsView: TrackingWebContentsView,
    sessionFromPartition: (partition, options) => session.fromPartition(partition, options),
    getOwnerWindow: (ownerWebContentsId) => (
      ownerWindow?.webContents.id === ownerWebContentsId ? ownerWindow : null
    ),
  });
  const runtime = createAppPreviewRuntime({
    app,
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    shell,
    readWorkspaceTextFile: async (rootPath, relativePath) => ({
      content: await fs.promises.readFile(path.join(rootPath, relativePath), "utf8"),
    }),
    resolveWorkspacePath: (rootPath, relativePath) => path.join(rootPath, relativePath),
  });
  previewService = createAppPreviewService({ runtime, browserSurfaces });
  const baseRequest = {
    rootPath: workspacePath,
    path: manifestPath,
    bounds: { x: 20, y: 40, width: 600, height: 420 },
    attachmentId: "attachment-smoke-1",
  };

  const first = await previewService.activate(ownerWindow.webContents, baseRequest);
  assert.equal(first.runtime.status, "running");
  assert.equal(first.surface?.status, "ready");
  assert.equal(first.surface?.attached, true);
  assert.equal(createdViews.length, 1);

  // A detach/reattach must preserve the runtime, native page and page state.
  const surfaceWebContents = createdViews[0].webContents;
  await surfaceWebContents.executeJavaScript("window.__puppyoneSmokeState = 42");
  assert.deepEqual(previewService.detachSurface(ownerWindow.webContents, {
    surfaceId: first.surface.surfaceId,
    attachmentId: baseRequest.attachmentId,
  }), { ok: true });

  const second = await previewService.activate(ownerWindow.webContents, {
    ...baseRequest,
    attachmentId: "attachment-smoke-2",
  });
  assert.equal(second.runtime.runtimeId, first.runtime.runtimeId);
  assert.equal(second.surface?.surfaceId, first.surface?.surfaceId);
  assert.equal(createdViews.length, 1);
  assert.equal(await surfaceWebContents.executeJavaScript("window.__puppyoneSmokeState"), 42);

  const stopped = await previewService.stop(ownerWindow.webContents, baseRequest);
  assert.equal(stopped.status, "stopped");
  await waitFor(() => surfaceWebContents.isDestroyed(), 2_000);
  assert.equal(surfaceWebContents.isDestroyed(), true);
  console.log("App Preview end-to-end native smoke passed.");
}

async function run() {
  try {
    await runSmoke();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await previewService?.closeAll();
    if (ownerWindow && !ownerWindow.isDestroyed()) ownerWindow.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fs.promises.rm(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50,
    }).catch(() => undefined);
    app.quit();
  }
}

// Let the ESM entry finish evaluating before Electron dispatches readiness.
// Top-level-awaiting app.whenReady() can deadlock Electron startup.
app.whenReady().then(run).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.quit();
});

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (!predicate() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

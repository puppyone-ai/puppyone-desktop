#!/usr/bin/env electron

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, session, shell, WebContentsView } from "electron";
import { createAppPreviewRuntime } from "../electron/app-preview-runtime.mjs";
import { createAppPreviewBrowserSurfaceManager } from "../electron/main/app-preview-browser-surface.mjs";
import { createAppPreviewService } from "../electron/main/app-preview-service.mjs";
import { createNativeSurfaceOcclusionCoordinator } from "../electron/main/native-surfaces/occlusion-coordinator.mjs";
import { createNativeSurfacePointerPassthroughCoordinator } from "../electron/main/native-surfaces/pointer-passthrough-coordinator.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "puppyone-app-preview-smoke-"));
const userDataPath = path.join(tempRoot, "user-data");
const workspacePath = path.join(tempRoot, "workspace");
const manifestPath = "smoke.puppyoneapp";
fs.mkdirSync(userDataPath, { recursive: true });
fs.mkdirSync(workspacePath, { recursive: true });
fs.writeFileSync(path.join(workspacePath, "server.mjs"), `
  import http from "node:http";
  const portIndex = process.argv.indexOf("--port");
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT);
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Preview smoke</title><main>ready</main>");
  });
  server.listen(port, process.env.HOST);
`, "utf8");
fs.writeFileSync(path.join(workspacePath, manifestPath), JSON.stringify({
  type: "puppyone.app",
  version: 1,
  name: "App Preview smoke",
  launch: {
    kind: "local-server",
    command: ["node", "server.mjs", "--port", "${port}"],
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
    // Keep Electron's visibility contract active without flashing a test
    // window on the user's desktop.
    show: true,
    opacity: 0,
    width: 800,
    height: 600,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await ownerWindow.loadURL(`data:text/html,${encodeURIComponent(`
    <!doctype html>
    <title>App Preview smoke owner</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; }
      #resize-gutter { position: absolute; left: 100px; top: 40px; width: 8px; height: 420px; }
    </style>
    <div id="resize-gutter"></div>
    <script>
      window.__resizePointerDown = false;
      window.__resizePointerMoveX = null;
      window.__resizePointerUp = false;
      document.getElementById("resize-gutter").addEventListener("pointerdown", (event) => {
        window.__resizePointerDown = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      });
      window.addEventListener("pointermove", (event) => {
        if (window.__resizePointerDown) window.__resizePointerMoveX = event.clientX;
      }, true);
      window.addEventListener("pointerup", () => {
        if (window.__resizePointerDown) window.__resizePointerUp = true;
      }, true);
    </script>
  `)}`);

  const nativeSurfaceOcclusion = createNativeSurfaceOcclusionCoordinator();
  const nativeSurfacePointerPassthrough = createNativeSurfacePointerPassthroughCoordinator();
  const browserSurfaces = createAppPreviewBrowserSurfaceManager({
    WebContentsView: TrackingWebContentsView,
    sessionFromPartition: (partition, options) => session.fromPartition(partition, options),
    getOwnerWindow: (ownerWebContentsId) => (
      ownerWindow?.webContents.id === ownerWebContentsId ? ownerWindow : null
    ),
    nativeSurfaceOcclusion,
    nativeSurfacePointerPassthrough,
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
    // The 8px [100, 108) resize gutter is renderer-owned. Native content
    // starts at 108 and must never overlap its pointer lane.
    bounds: { x: 108, y: 40, width: 600, height: 420 },
    attachmentId: "attachment-smoke-1",
  };

  const first = await previewService.activate(ownerWindow.webContents, baseRequest);
  assert.equal(first.runtime.status, "running");
  assert.equal(first.surface?.status, "ready");
  assert.equal(first.surface?.attached, true);
  assert.equal(createdViews.length, 1);

  ownerWindow.webContents.sendInputEvent({ type: "mouseMove", x: 104, y: 100 });
  ownerWindow.webContents.sendInputEvent({ type: "mouseDown", x: 104, y: 100, button: "left", clickCount: 1 });
  await waitFor(
    async () => ownerWindow.webContents.executeJavaScript("window.__resizePointerDown"),
    2_000,
  );
  assert.equal(
    await ownerWindow.webContents.executeJavaScript("window.__resizePointerDown"),
    true,
  );

  // Starting a renderer-owned resize must leave the native page visible. Once
  // the pointer crosses into that child view, its move/up input is translated
  // back to the owner renderer so the gesture and per-frame bounds sync stay
  // alive without an occlusion flash.
  const surfaceWebContents = createdViews[0].webContents;
  await ownerWindow.webContents.executeJavaScript("window.__resizePointerUp = false");
  nativeSurfacePointerPassthrough.setOwnerActive(ownerWindow.webContents.id, true);
  assert.equal(createdViews[0].getVisible(), true);
  surfaceWebContents.sendInputEvent({ type: "mouseMove", x: 50, y: 60 });
  await waitFor(
    async () => ownerWindow.webContents.executeJavaScript("window.__resizePointerMoveX === 158"),
    2_000,
  );
  assert.equal(
    await ownerWindow.webContents.executeJavaScript("window.__resizePointerMoveX"),
    158,
  );
  assert.deepEqual(browserSurfaces.setBounds({
    surfaceId: first.surface.surfaceId,
    attachmentId: baseRequest.attachmentId,
    bounds: { x: 158, y: 40, width: 550, height: 420 },
    visible: true,
    callerWebContentsId: ownerWindow.webContents.id,
  }), { ok: true, visible: true });
  assert.deepEqual(createdViews[0].getBounds(), { x: 158, y: 40, width: 550, height: 420 });
  assert.equal(createdViews[0].getVisible(), true);
  surfaceWebContents.sendInputEvent({
    type: "mouseUp",
    x: 50,
    y: 60,
    button: "left",
    clickCount: 1,
  });
  await waitFor(
    async () => ownerWindow.webContents.executeJavaScript("window.__resizePointerUp"),
    2_000,
  );
  assert.equal(nativeSurfacePointerPassthrough.isOwnerActive(ownerWindow.webContents.id), false);

  // Product chrome lives in the BrowserWindow renderer and cannot out-z-index
  // a native WebContentsView. The shared coordinator must hide without detach,
  // destruction or reload, then restore the exact same page.
  await surfaceWebContents.executeJavaScript("window.__puppyoneSmokeState = 42");
  nativeSurfaceOcclusion.setOwnerOccluded(ownerWindow.webContents.id, true);
  assert.equal(createdViews[0].getVisible(), false);
  assert.equal(surfaceWebContents.isDestroyed(), false);
  assert.equal(await surfaceWebContents.executeJavaScript("window.__puppyoneSmokeState"), 42);
  nativeSurfaceOcclusion.setOwnerOccluded(ownerWindow.webContents.id, false);
  assert.equal(createdViews[0].getVisible(), true);
  assert.equal(await surfaceWebContents.executeJavaScript("window.__puppyoneSmokeState"), 42);

  // A detach/reattach must preserve the runtime, native page and page state.
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
  while (!await predicate() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

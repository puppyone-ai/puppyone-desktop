#!/usr/bin/env electron

import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  session as electronSession,
  WebContentsView,
} from "electron";
import { build } from "vite";
import { createEditorSurfaceSessionManager } from "../electron/main/editor-surfaces/session-manager.mjs";
import { registerEditorSurfaceIpcHandlers } from "../electron/main/editor-surfaces/ipc.mjs";

protocol.registerSchemesAsPrivileged([{
  scheme: "puppyone-local",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "tests/fixtures/editor-rendering/sample_document.pdf");
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "puppyone-isolated-pdf-smoke-"));
const outputDir = path.join(tempRoot, "dist");
const userDataPath = path.join(tempRoot, "user-data");
const preloadPath = path.join(repoRoot, "electron/editor-surface-preload.cjs");
let ownerWindow = null;
let manager = null;
const lifecycle = [];
const childConsole = [];
const network = [];
let childSnapshot = null;

app.setPath("userData", userDataPath);
await fsp.access(fixturePath);
await build({
  configFile: path.join(repoRoot, "vite.config.ts"),
  root: repoRoot,
  logLevel: "warn",
  build: {
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "isolated-editor": path.join(repoRoot, "isolated-editor.html"),
      },
    },
  },
});

function waitFor(label, read, timeoutMs = 20_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const value = await read();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Isolated PDF Surface smoke timed out at ${label}.`));
          return;
        }
        setTimeout(poll, 30);
      } catch (error) {
        reject(error);
      }
    };
    void poll();
  });
}

function registerFixtureProtocol(partitionSession) {
  void partitionSession.protocol.handle("puppyone-local", async (request) => {
    network.push({ phase: "request", method: request.method, url: request.url, range: request.headers.get("range") });
    if (request.method === "HEAD") {
      const stats = await fsp.stat(fixturePath);
      return new Response(null, { status: 200, headers: pdfHeaders(stats.size) });
    }
    const bytes = await fsp.readFile(fixturePath);
    const range = parseRange(request.headers.get("range"), bytes.length);
    if (!range) {
      network.push({ phase: "response", status: 200, size: bytes.length });
      return new Response(bytes, { status: 200, headers: pdfHeaders(bytes.length) });
    }
    const body = bytes.subarray(range.start, range.end + 1);
    network.push({ phase: "response", status: 206, start: range.start, end: range.end, size: bytes.length });
    return new Response(body, {
      status: 206,
      headers: {
        ...pdfHeaders(body.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}`,
      },
    });
  });
  return () => {
    try {
      partitionSession.protocol.unhandle("puppyone-local");
    } catch {
      // The temporary partition may already be gone during app teardown.
    }
  };
}

function pdfHeaders(length) {
  return {
    "Content-Type": "application/pdf",
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "null",
  };
}

function parseRange(header, size) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
  return { start, end: Math.min(size - 1, Math.max(start, requestedEnd)) };
}

async function run() {
  let failed = false;
  try {
    ownerWindow = new BrowserWindow({
      show: true,
      opacity: 0,
      focusable: false,
      width: 1_100,
      height: 760,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    await ownerWindow.loadURL("data:text/html,<title>Editor Surface Host</title>");

    const surfaceUrl = pathToFileURL(path.join(outputDir, "isolated-editor.html")).toString();
    manager = createEditorSurfaceSessionManager({
      WebContentsView,
      sessionFromPartition: (partition, options) => electronSession.fromPartition(partition, options),
      getOwnerWindow: (ownerWebContentsId) => (
        ownerWebContentsId === ownerWindow.webContents.id ? ownerWindow : null
      ),
      preloadPath,
      surfaceUrl,
      configurePartition: ({ partitionSession }) => registerFixtureProtocol(partitionSession),
      bootstrapTimeoutMs: 5_000,
      firstFrameTimeoutMs: 20_000,
      onStateChange: (event) => lifecycle.push(event),
    });
    const localeService = {
      initialize: async () => undefined,
      getSnapshot: () => ({
        preference: "system",
        locale: "en",
        direction: "ltr",
        systemLanguages: ["en"],
      }),
    };
    registerEditorSurfaceIpcHandlers({
      trustedIpcMain: ipcMain,
      rawIpcMain: ipcMain,
      manager,
      localeService,
    });

    const session = await manager.activate({
      ownerWebContentsId: ownerWindow.webContents.id,
      viewerId: "pdf-preview",
      documentPath: "sample_document.pdf",
      documentRevision: "smoke:1",
      resourceUrl: "puppyone-local://file/smoke/file-preview/sample_document.pdf",
      title: "sample_document.pdf",
      safeMode: false,
      bounds: { x: 0, y: 0, width: 900, height: 700 },
      geometryRevision: 1,
      visible: true,
      appearance: { dark: true, direction: "ltr", attributes: {}, variables: {} },
    });
    const activeEntry = manager.values().find((candidate) => candidate.sessionId === session.sessionId);
    activeEntry?.view.webContents.on("console-message", (_event, details) => {
      childConsole.push({ level: details.level, message: details.message });
    });
    activeEntry?.view.webContents.on("preload-error", (_event, _path, error) => {
      childConsole.push({ level: "error", message: `preload-error: ${error.message}` });
    });

    const readyEntry = await waitFor("first-frame readiness", () => {
      const entry = manager.values().find((candidate) => candidate.sessionId === session.sessionId);
      return entry?.status === "ready" ? entry : null;
    }, 8_000);
    const childWebContents = readyEntry.view.webContents;
    const ownerProcessId = ownerWindow.webContents.getOSProcessId();
    const childProcessId = childWebContents.getOSProcessId();
    assert(ownerProcessId > 0 && childProcessId > 0, "Editor Surface process ids were unavailable.");
    assert.notEqual(childProcessId, ownerProcessId, "PDF Surface shared the App Shell renderer process.");

    const beforeResize = await childWebContents.executeJavaScript(`(() => {
      const preview = document.querySelector('.puppyone-pdf-preview');
      const canvas = document.querySelector('.puppyone-pdf-page canvas');
      return {
        previewState: preview?.getAttribute('data-preview-state') ?? null,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
      };
    })()`, true);
    assert.equal(beforeResize.previewState, "ready");
    assert(beforeResize.canvasWidth > 0 && beforeResize.canvasHeight > 0);

    manager.setBounds(
      session.sessionId,
      { x: 0, y: 0, width: 700, height: 700 },
      ownerWindow.webContents.id,
      2,
      false,
    );
    assert.equal(readyEntry.view.getBounds().width, 700, "Suspended layout bounds were not applied.");
    manager.setBounds(
      session.sessionId,
      { x: 0, y: 0, width: 900, height: 700 },
      ownerWindow.webContents.id,
      1,
      true,
    );
    assert.equal(readyEntry.view.getBounds().width, 700, "A stale geometry revision overwrote current bounds.");
    manager.setBounds(
      session.sessionId,
      { x: 0, y: 0, width: 700, height: 700 },
      ownerWindow.webContents.id,
      3,
      true,
    );
    const afterResize = await waitFor("resize render", async () => {
      const value = await childWebContents.executeJavaScript(`(() => {
        const canvas = document.querySelector('.puppyone-pdf-page canvas');
        return { width: canvas?.width ?? 0, height: canvas?.height ?? 0 };
      })()`, true);
      return value.width > 0 && value.width !== beforeResize.canvasWidth ? value : null;
    });

    childWebContents.forcefullyCrashRenderer();
    await waitFor("crash containment", () => manager.values().length === 0);
    assert.equal(ownerWindow.isDestroyed(), false, "PDF crash destroyed the App Shell window.");

    console.log(JSON.stringify({
      ok: true,
      bootstrapMode: "child-pull",
      ownerProcessId,
      childProcessId,
      beforeResize,
      afterResize,
      crashContained: true,
    }, null, 2));
  } catch (error) {
    const entry = manager?.values()[0] ?? null;
    if (entry?.view.webContents && !entry.view.webContents.isDestroyed()) {
      childSnapshot = await entry.view.webContents.executeJavaScript(`(() => ({
        location: window.location.href,
        bodyText: document.body.innerText.slice(0, 1000),
        hasBridge: Boolean(window.puppyoneEditorSurface),
        previewState: document.querySelector('.puppyone-pdf-preview')?.getAttribute('data-preview-state') ?? null,
        pageState: document.querySelector('.puppyone-pdf-page')?.getAttribute('data-page-state') ?? null,
        canvasWidth: document.querySelector('.puppyone-pdf-page canvas')?.width ?? 0,
        pageError: document.querySelector('.puppyone-pdf-page-error')?.textContent ?? null,
        previewRect: (() => {
          const rect = document.querySelector('.puppyone-pdf-preview')?.getBoundingClientRect();
          return rect ? { width: rect.width, height: rect.height } : null;
        })(),
        pageRect: (() => {
          const rect = document.querySelector('.puppyone-pdf-page')?.getBoundingClientRect();
          return rect ? { width: rect.width, height: rect.height } : null;
        })(),
        visibilityState: document.visibilityState,
        resources: performance.getEntriesByType('resource').map((entry) => entry.name).slice(-20),
        rootChildren: document.getElementById('root')?.childElementCount ?? -1,
      }))()`, true).catch((snapshotError) => ({ snapshotError: String(snapshotError) }));
    }
    console.error(error);
    console.error(JSON.stringify({ lifecycle, childConsole, network, childSnapshot }, null, 2));
    failed = true;
  } finally {
    manager?.destroyAll();
    if (ownerWindow && !ownerWindow.isDestroyed()) ownerWindow.destroy();
    await fsp.rm(tempRoot, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  }
}

app.whenReady().then(run).catch(async (error) => {
  console.error(error);
  await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  process.exit(1);
});

#!/usr/bin/env electron

import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, protocol } from "electron";
import { build } from "vite";

protocol.registerSchemesAsPrivileged([{
  scheme: "puppyone-smoke",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureIndex = process.argv.indexOf("--fixture");
const fixturePath = fixtureIndex >= 0
  ? path.resolve(process.argv[fixtureIndex + 1] ?? "")
  : path.join(repoRoot, "tests/fixtures/editor-rendering/sample_document.pdf");
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "puppyone-pdf-preview-smoke-"));
const outputDir = path.join(tempRoot, "dist");
const userDataPath = path.join(tempRoot, "user-data");
let window = null;

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
        index: path.join(repoRoot, "scripts/fixtures/pdf-preview-smoke.html"),
      },
    },
  },
});
const builtHtmlPath = (await fsp.readdir(outputDir, { recursive: true }))
  .find((entry) => entry.endsWith(".html"));
if (!builtHtmlPath) throw new Error("PDF Preview smoke build did not emit HTML.");

app.setPath("userData", userDataPath);

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function resolveSmokePath(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname === "/fixture.pdf") return fixturePath;
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const resolved = path.resolve(outputDir, relativePath || "index.html");
  if (resolved !== outputDir && !resolved.startsWith(`${outputDir}${path.sep}`)) {
    throw new Error("Smoke request escaped the build output directory.");
  }
  return resolved;
}

async function waitFor(expression, timeoutMs = 20_000) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await window.webContents.executeJavaScript(expression, true);
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`PDF Preview smoke timed out: ${JSON.stringify(lastValue)}`);
}

async function inspect() {
  return window.webContents.executeJavaScript(`(() => {
    const slot = document.querySelector('[data-surface-key="report.pdf"]');
    const preview = document.querySelector('.puppyone-pdf-preview');
    const canvas = document.querySelector('.puppyone-pdf-page canvas');
    const slotRect = slot?.getBoundingClientRect();
    const previewRect = preview?.getBoundingClientRect();
    return {
      oldSurfacePresent: Boolean(document.querySelector('[data-surface-key="notes.md"]')),
      state: slot?.getAttribute('data-surface-state') ?? null,
      preparation: slot?.getAttribute('data-surface-preparation') ?? null,
      ready: slot?.getAttribute('data-surface-ready') ?? null,
      previewState: preview?.getAttribute('data-preview-state') ?? null,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      slotLeft: slotRect?.left ?? 0,
      slotRight: slotRect?.right ?? 0,
      previewLeft: previewRect?.left ?? 0,
      previewRight: previewRect?.right ?? 0,
    };
  })()`, true);
}

async function run() {
  let failed = false;
  try {
    await protocol.handle("puppyone-smoke", async (request) => {
      try {
        const filePath = resolveSmokePath(request.url);
        return new Response(await fsp.readFile(filePath), {
          status: 200,
          headers: { "content-type": contentType(filePath) },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });

    window = new BrowserWindow({
      show: false,
      width: 1200,
      height: 760,
      backgroundColor: "#181818",
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const smokeUrl = new URL(`puppyone-smoke://app/${builtHtmlPath}`);
    smokeUrl.searchParams.set("pdf", "/fixture.pdf");
    await window.loadURL(smokeUrl.toString());
    await waitFor("Boolean(window.__pdfPreviewSmoke)");
    await window.webContents.executeJavaScript("window.__pdfPreviewSmoke.switchToPdf()", true);

    const activation = await waitFor(`(() => {
      const slot = document.querySelector('[data-surface-key="report.pdf"]');
      return slot && {
        state: slot.getAttribute('data-surface-state'),
        preparation: slot.getAttribute('data-surface-preparation'),
        oldSurfacePresent: Boolean(document.querySelector('[data-surface-key="notes.md"]')),
      };
    })()`);
    assert.equal(activation.state, "committed");
    assert.equal(activation.preparation, "requires-visible");
    assert.equal(activation.oldSurfacePresent, false);

    await waitFor(`
      document.querySelector('.puppyone-pdf-preview')?.dataset.previewState === 'ready'
      && document.querySelector('[data-surface-key="report.pdf"]')?.dataset.surfaceReady === 'true'
    `);
    const beforeResize = await inspect();
    assert.equal(beforeResize.ready, "true");
    assert.equal(beforeResize.previewState, "ready");
    assert(beforeResize.canvasWidth > 0 && beforeResize.canvasHeight > 0, "PDF.js did not render a canvas frame.");
    assert.equal(beforeResize.slotLeft, beforeResize.previewLeft);
    assert.equal(beforeResize.slotRight, beforeResize.previewRight);

    await window.webContents.executeJavaScript("window.__pdfPreviewSmoke.setSidebarWidth(360)", true);
    await waitFor(`
      document.querySelector('.puppyone-pdf-page canvas')?.width > 0
      && document.querySelector('.puppyone-pdf-page canvas')?.width !== ${beforeResize.canvasWidth}
    `);
    const afterResize = await inspect();
    assert.equal(afterResize.slotLeft, 360);
    assert.equal(afterResize.previewLeft, 360);
    assert.equal(afterResize.slotRight, beforeResize.slotRight);
    assert.equal(afterResize.previewRight, beforeResize.previewRight);
    assert(afterResize.canvasWidth > 0 && afterResize.canvasHeight > 0, "PDF canvas disappeared after resize.");

    console.log(JSON.stringify({
      ok: true,
      fixturePath,
      activation,
      beforeResize,
      afterResize,
    }, null, 2));
  } catch (error) {
    console.error(error);
    failed = true;
  } finally {
    if (window && !window.isDestroyed()) window.destroy();
    await protocol.unhandle("puppyone-smoke");
    await fsp.rm(tempRoot, { recursive: true, force: true });
    app.exit(failed ? 1 : 0);
  }
}

app.whenReady().then(run).catch(async (error) => {
  console.error(error);
  await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  app.exit(1);
});

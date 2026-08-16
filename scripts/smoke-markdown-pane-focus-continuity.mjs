#!/usr/bin/env electron

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "puppyone-markdown-focus-"));
let browserWindow = null;
let vite = null;

app.setPath("userData", path.join(tempRoot, "user-data"));
app.commandLine.appendSwitch("disable-gpu");

app.whenReady().then(run).catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

async function run() {
  let exitCode = 0;
  try {
    const { createServer } = await import("vite");
    vite = await createServer({
      root: repoRoot,
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    });
    await vite.listen();
    const address = vite.httpServer?.address();
    if (!address || typeof address === "string") {
      throw new Error("Vite did not expose a TCP port");
    }
    const fixtureUrl = `http://127.0.0.1:${address.port}/scripts/fixtures/markdown-pane-focus-continuity.html`;
    browserWindow = new BrowserWindow({
      show: false,
      width: 1100,
      height: 760,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    browserWindow.webContents.on("console-message", (details) => {
      if (details.level === "error") {
        console.error(`[markdown-focus-fixture] ${details.message}`);
      }
    });
    browserWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[markdown-focus-fixture] renderer exited: ${details.reason}`);
    });
    await withTimeout(
      browserWindow.loadURL(fixtureUrl),
      8_000,
      "Fixture URL did not finish loading",
    );
    // CodeMirror only emits semantic focus transactions while its containing
    // BrowserWindow owns native focus. Keep the smoke window transparent so
    // the test exercises real Chromium focus without visual test chrome.
    browserWindow.setOpacity(0);
    browserWindow.show();
    browserWindow.focus();

    const result = await browserWindow.webContents.executeJavaScript(`(async () => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const readyDeadline = performance.now() + 5_000;
    while (!window.markdownPaneFocusFixture?.ready) {
      if (performance.now() >= readyDeadline) {
        throw new Error('Markdown focus fixture did not become ready');
      }
      await frame();
    }
    const { left, right } = window.markdownPaneFocusFixture;
    const originalScrollSnapshot = left.scrollSnapshot.bind(left);
    let snapshotCount = 0;
    left.scrollSnapshot = () => {
      snapshotCount += 1;
      return originalScrollSnapshot();
    };
    const target = left.state.doc.toString().indexOf("inline emphasis") + 3;
    left.dispatch({ selection: { anchor: target } });
    left.scrollDOM.scrollTop = 1600;
    await frame();
    await frame();
    left.focus();
    await wait(30);
    const baseline = left.scrollDOM.scrollTop;
    const samples = [];
    for (let index = 0; index < 6; index += 1) {
      right.focus();
      await wait(30);
      samples.push(left.scrollDOM.scrollTop);
      left.focus();
      await wait(30);
    }
    return {
      baseline,
      samples,
      snapshotCount,
      scrollHeight: left.scrollDOM.scrollHeight,
      clientHeight: left.scrollDOM.clientHeight,
    };
    })()`, true);

    for (const [index, sample] of result.samples.entries()) {
      if (Math.abs(sample - result.baseline) > 0.75) {
        throw new Error(
          `left pane drifted after focus cycle ${index + 1}: ${result.baseline} -> ${sample}`,
        );
      }
    }
    if (result.snapshotCount !== 13) {
      throw new Error(`expected 13 editor-local focus snapshots, received ${result.snapshotCount}`);
    }
    console.info(JSON.stringify(result, null, 2));
  } catch (error) {
    exitCode = 1;
    console.error(error instanceof Error ? error.stack : String(error));
  } finally {
    browserWindow?.destroy();
    await vite?.close();
    await fsp.rm(tempRoot, { recursive: true, force: true });
    process.exit(exitCode);
  }
}

function withTimeout(promise, duration, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), duration)),
  ]);
}

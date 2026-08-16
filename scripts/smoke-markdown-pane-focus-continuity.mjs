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
    browserWindow.setAlwaysOnTop(true, "screen-saver");
    browserWindow.show();
    if (process.platform === "darwin") app.focus({ steal: true });
    browserWindow.focus();

    const result = await browserWindow.webContents.executeJavaScript(`(async () => {
    const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const settle = async () => {
      await wait(30);
      await frame();
      await frame();
    };
    const focusAndSettle = async (view, paneId) => {
      view.focus();
      const deadline = performance.now() + 5_000;
      let attempts = 0;
      while (
        !view.hasFocus
        || document.querySelector('.desktop-editor-pane[data-active="true"]')
          ?.dataset.editorPaneId !== paneId
      ) {
        if (performance.now() >= deadline) {
          throw new Error('Focus did not settle on ' + paneId);
        }
        await wait(20);
        await frame();
        attempts += 1;
        if (attempts % 5 === 0) {
          window.focus();
          view.focus();
        }
      }
      await frame();
      await frame();
    };
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { top: value.top, left: value.left, width: value.width, height: value.height };
    };
    const readyDeadline = performance.now() + 5_000;
    while (!window.markdownPaneFocusFixture?.ready) {
      if (performance.now() >= readyDeadline) {
        throw new Error('Markdown focus fixture did not become ready');
      }
      await frame();
    }
    const fixture = window.markdownPaneFocusFixture;
    const [left, right] = fixture.views;
    const [leftPane, rightPane] = fixture.panes;
    const split = document.querySelector('.desktop-editor-split[data-direction="horizontal"]');
    if (!left || !right || !leftPane || !rightPane || !split) {
      throw new Error('Fixture is not a real two-pane horizontal MDI workbench');
    }
    const initialPaneIds = fixture.panes.map((pane) => pane.dataset.editorPaneId);
    if (initialPaneIds.join(',') !== 'editor-pane-1,editor-pane-2') {
      throw new Error('Fixture pane identity/order is invalid: ' + initialPaneIds.join(','));
    }

    const leftOriginalScrollSnapshot = left.scrollSnapshot.bind(left);
    const rightOriginalScrollSnapshot = right.scrollSnapshot.bind(right);
    const snapshotCount = { left: 0, right: 0 };
    left.scrollSnapshot = () => {
      snapshotCount.left += 1;
      return leftOriginalScrollSnapshot();
    };
    right.scrollSnapshot = () => {
      snapshotCount.right += 1;
      return rightOriginalScrollSnapshot();
    };

    // Keep the caret far above the viewport. This is the exact Live Preview
    // projection shape that used to make a background pane creep by one
    // measured source line on every blur.
    const leftTarget = left.state.doc.toString().indexOf('focus continuity') + 3;
    const rightTarget = right.state.doc.toString().indexOf('focus continuity') + 3;
    left.dispatch({ selection: { anchor: leftTarget } });
    right.dispatch({ selection: { anchor: rightTarget } });
    await focusAndSettle(left, 'editor-pane-1');
    left.scrollDOM.scrollTop = 1600;
    right.scrollDOM.scrollTop = 1200;
    await settle();

    const baseline = {
      leftScrollTop: left.scrollDOM.scrollTop,
      rightScrollTop: right.scrollDOM.scrollTop,
      leftPane: rect(leftPane),
      rightPane: rect(rightPane),
      leftScroller: rect(left.scrollDOM),
      rightScroller: rect(right.scrollDOM),
    };
    if (baseline.leftPane.left >= baseline.rightPane.left) {
      throw new Error('Horizontal MDI panes do not occupy left/right tracks');
    }

    const samples = [];
    for (let index = 0; index < 12; index += 1) {
      await focusAndSettle(right, 'editor-pane-2');
      const rightActivePaneId = document.querySelector('.desktop-editor-pane[data-active="true"]')
        ?.dataset.editorPaneId ?? null;
      const afterRightFocus = {
        leftScrollTop: left.scrollDOM.scrollTop,
        rightScrollTop: right.scrollDOM.scrollTop,
        activePaneId: rightActivePaneId,
      };

      await focusAndSettle(left, 'editor-pane-1');
      const leftActivePaneId = document.querySelector('.desktop-editor-pane[data-active="true"]')
        ?.dataset.editorPaneId ?? null;
      samples.push({
        afterRightFocus,
        afterLeftFocus: {
          leftScrollTop: left.scrollDOM.scrollTop,
          rightScrollTop: right.scrollDOM.scrollTop,
          activePaneId: leftActivePaneId,
        },
        leftPane: rect(leftPane),
        rightPane: rect(rightPane),
        leftScroller: rect(left.scrollDOM),
        rightScroller: rect(right.scrollDOM),
      });
    }

    const currentPanes = Array.from(document.querySelectorAll('.desktop-editor-pane'));
    const currentViews = Array.from(document.querySelectorAll('.cm-editor'))
      .map((element) => window.markdownPaneFocusFixture.views.find(
        (view) => view.dom === element,
      ));
    return {
      baseline,
      samples,
      snapshotCount,
      readCount: fixture.readCount,
      paneIdentityStable: currentPanes[0] === leftPane && currentPanes[1] === rightPane,
      viewIdentityStable: currentViews[0] === left && currentViews[1] === right,
      scrollHeight: left.scrollDOM.scrollHeight,
      clientHeight: left.scrollDOM.clientHeight,
      leftContentEditable: left.contentDOM.contentEditable,
      rightContentEditable: right.contentDOM.contentEditable,
    };
    })()`, true);

    assert(
      result.leftContentEditable === "true" && result.rightContentEditable === "true",
      "MDI regression fixture must exercise two production-editable Markdown surfaces",
    );
    assert(result.readCount === 2, `expected one source read per pane, received ${result.readCount}`);
    assert(result.paneIdentityStable, "pane DOM identity changed during focus routing");
    assert(result.viewIdentityStable, "CodeMirror EditorView identity changed during focus routing");
    for (const [index, sample] of result.samples.entries()) {
      assertClose(
        sample.afterRightFocus.leftScrollTop,
        result.baseline.leftScrollTop,
        `left pane drifted when right pane gained focus in cycle ${index + 1}`,
      );
      assertClose(
        sample.afterLeftFocus.rightScrollTop,
        result.baseline.rightScrollTop,
        `right pane drifted when left pane regained focus in cycle ${index + 1}`,
      );
      assert(
        sample.afterRightFocus.activePaneId === "editor-pane-2",
        `right focus did not route active pane in cycle ${index + 1}`,
      );
      assert(
        sample.afterLeftFocus.activePaneId === "editor-pane-1",
        `left focus did not route active pane in cycle ${index + 1}`,
      );
      for (const key of ["leftPane", "rightPane", "leftScroller", "rightScroller"]) {
        for (const property of ["top", "left", "width", "height"]) {
          assertClose(
            sample[key][property],
            result.baseline[key][property],
            `${key}.${property} changed during focus cycle ${index + 1}`,
          );
        }
      }
    }
    assert(
      result.snapshotCount.left === 25 && result.snapshotCount.right === 24,
      `expected editor-local snapshot counts 25/24, received ${result.snapshotCount.left}/${result.snapshotCount.right}`,
    );
    console.info(JSON.stringify({
      baseline: {
        leftScrollTop: result.baseline.leftScrollTop,
        rightScrollTop: result.baseline.rightScrollTop,
      },
      cycles: result.samples.length,
      snapshotCount: result.snapshotCount,
      readCount: result.readCount,
      paneIdentityStable: result.paneIdentityStable,
      viewIdentityStable: result.viewIdentityStable,
    }, null, 2));
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 0.75) {
    throw new Error(`${message}: ${expected} -> ${actual}`);
  }
}

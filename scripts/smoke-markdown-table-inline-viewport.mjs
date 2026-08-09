#!/usr/bin/env electron

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "puppyone-markdown-table-inline-"));
const windows = [];

app.setPath("userData", path.join(tempRoot, "user-data"));
app.commandLine.appendSwitch("disable-gpu");

const [markdownEditorCss, editableTableCss, markdownTableCss] = await Promise.all([
  fsp.readFile(
    path.join(repoRoot, "packages/shared-ui/src/styles/editor/markdown-editor.css"),
    "utf8",
  ),
  fsp.readFile(
    path.join(repoRoot, "packages/shared-ui/src/styles/editor/editable-table.css"),
    "utf8",
  ),
  fsp.readFile(
    path.join(repoRoot, "packages/shared-ui/src/styles/editor/markdown-table-widget.css"),
    "utf8",
  ),
]);

function assertNear(actual, expected, label, tolerance = 1.5) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, received ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tableMarkup(direction) {
  const columns = Array.from({ length: 12 }, () => '<col style="width:180px">').join("");
  const cells = Array.from(
    { length: 12 },
    (_, index) => `<th><span class="cm-md-table-cell-content">Column ${index + 1}</span></th>`,
  ).join("");
  return `
    <div class="cm-md-table-widget-wrap po-editable-table-interaction-root" dir="${direction}" data-md-table-inline-viewport="true">
      <div class="cm-md-table-frame" data-md-table-scroll-track="true">
        <div class="cm-md-table-surface" data-md-table-surface="true">
          <table class="cm-md-table-widget is-windowed" dir="${direction}" style="width:2160px">
            <colgroup>${columns}</colgroup>
            <thead><tr>${cells}</tr></thead>
          </table>
          <button class="cm-md-table-structure-button cm-md-table-add-column po-editable-table-structure-button po-editable-table-add-column" type="button">
            <span class="cm-md-table-structure-button-visual po-editable-table-structure-button-visual"></span>
          </button>
        </div>
      </div>
    </div>`;
}

function fixtureHtml(direction) {
  return `<!doctype html>
    <html dir="${direction}">
      <head>
        <meta charset="utf-8">
        <style>
          :root {
            --po-accent: #4c70ff;
            --po-border: #d8dbe2;
            --po-control: #eef0f4;
            --po-divider: #d6d9df;
            --po-editor-bg: #fff;
            --po-editor-content-edge-inset: 64px;
            --po-font-sans: system-ui, sans-serif;
            --po-panel: #fff;
            --po-scrollbar-thumb: #aeb4bf;
            --po-text: #20232a;
            --po-text-muted: #626873;
          }
          html, body, #root {
            width: 100%;
            height: 100%;
            margin: 0;
          }
          body { overflow: hidden; }
          .markdown-codemirror-editor { width: 100%; height: 100%; }
          .cm-editor, .cm-scroller { width: 100%; height: 100%; }
          .cm-scroller { overflow-y: auto; overflow-x: auto; }
          .cm-line { display: block; }
          ${markdownEditorCss}
          ${editableTableCss}
          ${markdownTableCss}
        </style>
      </head>
      <body>
        <div id="root" class="markdown-codemirror-editor">
          <div class="cm-editor">
            <div class="cm-scroller">
              <div class="cm-content">
                <div class="cm-line">${tableMarkup(direction)}</div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>`;
}

async function measureScenario(viewportWidth, direction) {
  const browserWindow = new BrowserWindow({
    show: false,
    width: viewportWidth,
    height: 360,
    webPreferences: {
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windows.push(browserWindow);
  await browserWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(fixtureHtml(direction))}`,
  );

  return browserWindow.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await nextFrame();
      await nextFrame();
      const direction = ${JSON.stringify(direction)};
      const root = document.querySelector(".markdown-codemirror-editor");
      const outer = document.querySelector(".cm-scroller");
      const content = document.querySelector(".cm-content");
      const viewport = document.querySelector(".cm-md-table-widget-wrap");
      const frame = document.querySelector(".cm-md-table-frame");
      const table = document.querySelector(".cm-md-table-widget");
      const thirdColumn = table.rows[0].cells[2];
      const addColumn = document.querySelector(".cm-md-table-add-column");
      const rootRect = root.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const leadingInset = direction === "rtl"
        ? viewportRect.right - tableRect.right
        : tableRect.left - viewportRect.left;
      const initial = {
        rootLeft: rootRect.left,
        rootRight: rootRect.right,
        contentLeft: contentRect.left,
        contentRight: contentRect.right,
        viewportLeft: viewportRect.left,
        viewportRight: viewportRect.right,
        tableLeft: tableRect.left,
        tableRight: tableRect.right,
        leadingInset,
        framePaddingInlineStart: Number.parseFloat(
          direction === "rtl" ? getComputedStyle(frame).paddingRight : getComputedStyle(frame).paddingLeft,
        ),
        outerScrollLeft: outer.scrollLeft,
        bodyScrollWidth: document.body.scrollWidth,
        viewportScrollWidth: viewport.scrollWidth,
        viewportClientWidth: viewport.clientWidth,
      };

      const targetLogicalOffset = leadingInset + 360;
      viewport.scrollLeft = direction === "rtl" ? -targetLogicalOffset : targetLogicalOffset;
      await nextFrame();
      await nextFrame();
      const scrolledViewportRect = viewport.getBoundingClientRect();
      const scrolledTableRect = table.getBoundingClientRect();
      const thirdRect = thirdColumn.getBoundingClientRect();
      const scrolled = {
        rawScrollLeft: viewport.scrollLeft,
        tableLeft: scrolledTableRect.left,
        tableRight: scrolledTableRect.right,
        thirdLeft: thirdRect.left,
        thirdRight: thirdRect.right,
        viewportLeft: scrolledViewportRect.left,
        viewportRight: scrolledViewportRect.right,
        outerScrollLeft: outer.scrollLeft,
      };

      const maximum = viewport.scrollWidth - viewport.clientWidth;
      viewport.scrollLeft = direction === "rtl" ? -maximum : maximum;
      await nextFrame();
      await nextFrame();
      const endViewportRect = viewport.getBoundingClientRect();
      const addRect = addColumn.getBoundingClientRect();
      const end = {
        addLeft: addRect.left,
        addRight: addRect.right,
        viewportLeft: endViewportRect.left,
        viewportRight: endViewportRect.right,
        outerScrollLeft: outer.scrollLeft,
      };
      return { direction, viewportWidth: window.innerWidth, initial, scrolled, end };
    })()
  `, true);
}

async function runSmoke() {
  const results = [];
  for (const direction of ["ltr", "rtl"]) {
    for (const viewportWidth of [600, 1000, 1600, 2100]) {
      const result = await measureScenario(viewportWidth, direction);
      const { initial, scrolled, end } = result;
      const actualViewportWidth = result.viewportWidth;
      const label = `${direction}-${actualViewportWidth}`;
      const expectedGutter = Math.max(64, (actualViewportWidth - 724) / 2);
      const expectedSafeStart = 64;
      const expectedBreakoutEnd = expectedGutter + Math.min(
        1180,
        actualViewportWidth - expectedGutter - 48,
      );

      assert(initial.viewportScrollWidth > initial.viewportClientWidth, `${label}: fixture is not wide`);
      assertNear(initial.leadingInset, expectedGutter - 64, `${label}: scroll-away inset`);
      assertNear(
        initial.framePaddingInlineStart,
        initial.leadingInset + 14,
        `${label}: track leading padding`,
      );
      if (direction === "ltr") {
        assertNear(initial.viewportLeft, expectedSafeStart, `${label}: safe edge`);
        assertNear(initial.viewportRight, expectedBreakoutEnd, `${label}: breakout end`);
        assertNear(initial.tableLeft, expectedGutter, `${label}: resting reading rail`);
        assertNear(scrolled.thirdLeft, scrolled.viewportLeft, `${label}: later column reaches safe edge`);
        assert(scrolled.tableLeft < scrolled.viewportLeft, `${label}: leading table content did not leave`);
        assert(end.addRight <= end.viewportRight + 1.5, `${label}: add-column rail is clipped at end`);
        assert(end.addLeft >= end.viewportLeft - 1.5, `${label}: add-column rail is unreachable`);
      } else {
        assertNear(initial.viewportRight, actualViewportWidth - expectedSafeStart, `${label}: safe edge`);
        assertNear(initial.viewportLeft, actualViewportWidth - expectedBreakoutEnd, `${label}: breakout end`);
        assertNear(initial.tableRight, actualViewportWidth - expectedGutter, `${label}: resting reading rail`);
        assertNear(scrolled.thirdRight, scrolled.viewportRight, `${label}: later column reaches safe edge`);
        assert(scrolled.tableRight > scrolled.viewportRight, `${label}: leading table content did not leave`);
        assert(end.addLeft >= end.viewportLeft - 1.5, `${label}: add-column rail is clipped at end`);
        assert(end.addRight <= end.viewportRight + 1.5, `${label}: add-column rail is unreachable`);
      }
      assertNear(initial.outerScrollLeft, 0, `${label}: outer horizontal position at rest`);
      assertNear(scrolled.outerScrollLeft, 0, `${label}: outer horizontal position while scrolling`);
      assertNear(end.outerScrollLeft, 0, `${label}: outer horizontal position at end`);
      assert(
        initial.bodyScrollWidth <= actualViewportWidth,
        `${label}: table created page-level horizontal overflow`,
      );
      results.push(result);
    }
  }
  console.log(JSON.stringify({ ok: true, scenarios: results }, null, 2));
}

async function finish(exitCode) {
  for (const browserWindow of windows) {
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
  }
  await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  app.exit(exitCode);
}

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    await runSmoke();
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await finish(exitCode);
  }
}).catch(async (error) => {
  console.error(error);
  await finish(1);
});

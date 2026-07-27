#!/usr/bin/env electron

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "puppyone-csv-sticky-smoke-"));
const userDataPath = path.join(tempRoot, "user-data");
const windows = [];

await fsp.mkdir(userDataPath, { recursive: true });
app.setPath("userData", userDataPath);
app.commandLine.appendSwitch("disable-gpu");

const [editorChromeCss, editableTableCss, csvTableCss] = await Promise.all([
  fsp.readFile(
    path.join(repoRoot, "packages/shared-ui/src/styles/editor/editor-chrome.css"),
    "utf8",
  ),
  fsp.readFile(
    path.join(repoRoot, "packages/shared-ui/src/styles/editor/editable-table.css"),
    "utf8",
  ),
  fsp.readFile(
    path.join(repoRoot, "packages/shared-ui/src/styles/editor/csv-table-editor.css"),
    "utf8",
  ),
]);

function assertNear(actual, expected, label, tolerance = 1.25) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, received ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tableMarkup() {
  const columns = Array.from(
    { length: 8 },
    (_, columnIndex) => `<col style="width:${150 + columnIndex * 5}px">`,
  ).join("");
  const headerCells = Array.from(
    { length: 8 },
    (_, columnIndex) => `
      <th class="csv-table-editor__header-cell" scope="col">
        <input value="Column ${columnIndex + 1}" readonly>
      </th>`,
  ).join("");
  const rows = Array.from({ length: 48 }, (_, rowIndex) => {
    const cells = Array.from(
      { length: 8 },
      (_, columnIndex) => `
        <td class="csv-table-editor__body-cell">
          <input value="R${rowIndex + 1} C${columnIndex + 1}" readonly>
        </td>`,
    ).join("");
    return `
      <tr>
        <th class="csv-table-editor__record-index" scope="row">
          <span class="csv-table-editor__record-index-label">${rowIndex + 1}</span>
        </th>
        ${cells}
      </tr>`;
  }).join("");

  return `
    <section class="csv-table-editor" data-row-numbers-visible="true">
      <div class="csv-table-editor__scroll">
        <div class="csv-table-editor__settings">
          <button class="csv-table-editor__settings-button" type="button">⋮</button>
        </div>
        <div class="csv-table-editor__frame">
          <div class="csv-table-editor__surface" data-header-enabled="true" dir="ltr">
            <table class="csv-table-editor__table">
              <colgroup>
                <col class="csv-table-editor__record-index-column">
                ${columns}
              </colgroup>
              <thead>
                <tr>
                  <th
                    class="csv-table-editor__record-index csv-table-editor__record-index--header"
                    scope="row"
                  ></th>
                  ${headerCells}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>`;
}

function fixtureHtml() {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          :root {
            --po-accent: #4c70ff;
            --po-border: #d8dbe2;
            --po-control: #eef0f4;
            --po-danger: #d33;
            --po-divider: #d6d9df;
            --po-editor-bg: #fff;
            --po-font-sans: system-ui, sans-serif;
            --po-hover: #edf2ff;
            --po-panel: #fff;
            --po-panel-raised: #fff;
            --po-scrollbar-thumb: #aeb4bf;
            --po-selected: #e5ebff;
            --po-shadow: #000;
            --po-text: #20232a;
            --po-text-disabled: #8d929c;
            --po-text-muted: #626873;
          }
          html, body, #root {
            width: 100%;
            height: 100%;
            margin: 0;
          }
          body {
            overflow: hidden;
            font-family: var(--po-font-sans);
          }
          .editor-host {
            display: flex;
            width: 100%;
            height: 100%;
            min-height: 0;
            flex-direction: column;
          }
          ${editorChromeCss}
          ${editableTableCss}
          ${csvTableCss}
        </style>
      </head>
      <body>
        <div id="root">
          <section class="editor-host">
            <div class="editor-live-surface" data-scroll-owner="viewer">
              ${tableMarkup()}
            </div>
          </section>
        </div>
      </body>
    </html>`;
}

async function measureScenario(viewportWidth) {
  const window = new BrowserWindow({
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
  windows.push(window);
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fixtureHtml())}`);

  return window.webContents.executeJavaScript(`
    (async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await nextFrame();
      await nextFrame();

      const outer = document.querySelector(".editor-live-surface");
      const scroll = document.querySelector(".csv-table-editor__scroll");
      const frame = document.querySelector(".csv-table-editor__frame");
      const table = document.querySelector(".csv-table-editor__table");
      const settings = document.querySelector(".csv-table-editor__settings");
      const header = document.querySelector(".csv-table-editor__header-cell");
      const rowIndex = document.querySelector("tbody .csv-table-editor__record-index");
      const corner = document.querySelector("thead .csv-table-editor__record-index");
      const editor = document.querySelector(".csv-table-editor");
      const scrollRect = scroll.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const settingsRect = settings.getBoundingClientRect();
      const initialHeaderRect = header.getBoundingClientRect();
      const initialIndexRect = rowIndex.getBoundingClientRect();
      const styles = getComputedStyle(editor);

      const initial = {
        blockInset: Number.parseFloat(styles.getPropertyValue("--csv-table-content-block-start-inset")),
        inlineInset: Number.parseFloat(styles.getPropertyValue("--csv-table-content-inline-start-inset")),
        framePaddingTop: Number.parseFloat(getComputedStyle(frame).paddingTop),
        framePaddingLeft: Number.parseFloat(getComputedStyle(frame).paddingLeft),
        headerTop: initialHeaderRect.top - scrollRect.top,
        indexLeft: initialIndexRect.left - scrollRect.left,
        tableTop: tableRect.top - scrollRect.top,
        settingsBottom: settingsRect.bottom - scrollRect.top,
        outerOverflowY: getComputedStyle(outer).overflowY,
        innerCanScroll:
          scroll.scrollHeight > scroll.clientHeight && scroll.scrollWidth > scroll.clientWidth,
      };

      scroll.scrollTop = 144;
      scroll.scrollLeft = 210;
      await nextFrame();
      await nextFrame();

      const stuckScrollRect = scroll.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const indexRect = rowIndex.getBoundingClientRect();
      const cornerRect = corner.getBoundingClientRect();
      const scrolledSettingsRect = settings.getBoundingClientRect();
      return {
        viewportWidth: window.innerWidth,
        initial,
        scrolled: {
          scrollTop: scroll.scrollTop,
          scrollLeft: scroll.scrollLeft,
          headerTop: headerRect.top - stuckScrollRect.top,
          indexLeft: indexRect.left - stuckScrollRect.left,
          cornerTop: cornerRect.top - stuckScrollRect.top,
          cornerLeft: cornerRect.left - stuckScrollRect.left,
          settingsBottom: scrolledSettingsRect.bottom - stuckScrollRect.top,
          outerScrollTop: outer.scrollTop,
        },
      };
    })()
  `, true);
}

async function runSmoke() {
  const results = [];
  for (const viewportWidth of [800, 600]) {
    const result = await measureScenario(viewportWidth);
    const label = viewportWidth > 640 ? "desktop" : "compact";
    const { initial, scrolled } = result;

    assert(initial.outerOverflowY === "clip", `${label}: the frame remained a second scroll owner`);
    assert(initial.innerCanScroll, `${label}: fixture did not exercise both scroll axes`);
    assertNear(initial.framePaddingTop, initial.blockInset, `${label}: block inset owner`);
    assertNear(initial.framePaddingLeft, initial.inlineInset, `${label}: inline inset owner`);
    assert(
      initial.settingsBottom <= initial.tableTop + 0.5,
      `${label}: view settings overlap the table at rest`,
    );
    assert(
      initial.headerTop >= initial.blockInset,
      `${label}: the resting header lost its intended content inset`,
    );
    assert(
      initial.indexLeft >= initial.inlineInset,
      `${label}: the resting row gutter lost its intended content inset`,
    );
    assert(scrolled.scrollTop > initial.blockInset, `${label}: vertical scroll was not applied`);
    assert(scrolled.scrollLeft > initial.inlineInset, `${label}: horizontal scroll was not applied`);
    assertNear(scrolled.headerTop, 0, `${label}: sticky header viewport edge`);
    assertNear(scrolled.indexLeft, 0, `${label}: sticky row gutter viewport edge`);
    assertNear(scrolled.cornerTop, 0, `${label}: sticky corner block edge`);
    assertNear(scrolled.cornerLeft, 0, `${label}: sticky corner inline edge`);
    assert(
      scrolled.settingsBottom < 0,
      `${label}: view settings did not leave before the header docked`,
    );
    assertNear(scrolled.outerScrollTop, 0, `${label}: outer frame unexpectedly scrolled`);
    results.push({ label, ...result });
  }

  console.log(JSON.stringify({ ok: true, scenarios: results }, null, 2));
}

async function finish(exitCode) {
  for (const window of windows) {
    if (!window.isDestroyed()) window.destroy();
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

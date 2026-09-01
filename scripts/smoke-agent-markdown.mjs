#!/usr/bin/env electron

import { app, BrowserWindow } from "electron";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = path.join(repoRoot, "dist", "index.html");
const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-markdown-"));
app.setPath("userData", path.join(tempRoot, "user-data"));
app.commandLine.appendSwitch("disable-renderer-backgrounding");

let ownerWindow = null;
let renderProcessFailure = null;

async function runSmoke() {
  await fsp.access(indexPath);
  ownerWindow = new BrowserWindow({
    show: false,
    width: 760,
    height: 900,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  ownerWindow.webContents.on("render-process-gone", (_event, details) => {
    renderProcessFailure = `${details.reason}:${details.exitCode}`;
  });

  const url = pathToFileURL(indexPath);
  url.searchParams.set("theme", "dark");
  url.hash = "agent-visual-smoke";
  await ownerWindow.loadURL(url.href);
  await waitFor("document.querySelector('.desktop-agent-markdown-table-scroll table')");
  await ownerWindow.webContents.executeJavaScript(
    "document.querySelector('.desktop-agent-mermaid')?.scrollIntoView({ block: 'center' })",
    true,
  );
  await waitFor("document.querySelector('.desktop-agent-mermaid.is-ready .po-safe-mermaid-svg-root')?.shadowRoot?.querySelector('svg')");

  const result = await ownerWindow.webContents.executeJavaScript(`(() => {
    const viewport = document.querySelector('.desktop-agent-markdown-table-scroll');
    const table = viewport?.querySelector('table');
    const tasks = [...document.querySelectorAll('.desktop-agent-markdown .task-list-item input')];
    const mermaidRoot = document.querySelector('.desktop-agent-mermaid .po-safe-mermaid-svg-root');
    const transcript = document.querySelector('.desktop-agent-transcript');
    return {
      tableHeaders: table ? [...table.querySelectorAll('thead th')].map((cell) => cell.textContent?.trim()) : [],
      tableRows: table?.querySelectorAll('tbody tr').length ?? 0,
      tableViewportIsFocusable: viewport?.tabIndex === 0,
      tableViewportFitsTranscript: Boolean(viewport && transcript && viewport.getBoundingClientRect().width <= transcript.getBoundingClientRect().width),
      taskStates: tasks.map((task) => ({ checked: task.checked, disabled: task.disabled })),
      mermaidUsesShadowDom: Boolean(mermaidRoot?.shadowRoot),
      mermaidHasSvg: Boolean(mermaidRoot?.shadowRoot?.querySelector('svg')),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`, true);

  assert(result.tableHeaders.join("|") === "Layer|Owner|Contract", "GFM table headers did not render semantically.");
  assert(result.tableRows === 2, "GFM table body did not render both rows.");
  assert(result.tableViewportIsFocusable, "Wide table viewport is not keyboard-focusable.");
  assert(result.tableViewportFitsTranscript, "Table escaped the Agent transcript boundary.");
  assert(result.taskStates.length === 2 && result.taskStates.every((task) => task.disabled), "Task-list inputs are not inert.");
  assert(result.taskStates[0]?.checked === true && result.taskStates[1]?.checked === false, "Task-list state was not preserved.");
  assert(result.mermaidUsesShadowDom && result.mermaidHasSvg, "Mermaid did not use the shared safe Shadow DOM mount.");
  assert(result.documentOverflow <= 1, "Agent Markdown introduced page-level horizontal overflow.");
  if (renderProcessFailure) throw new Error(`Agent Markdown smoke renderer exited: ${renderProcessFailure}`);

  console.log(JSON.stringify({ schema: "puppyone-agent-markdown-smoke/v1", ...result }, null, 2));
}

async function waitFor(expression, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (renderProcessFailure) throw new Error(`Agent Markdown smoke renderer exited: ${renderProcessFailure}`);
    const ready = await ownerWindow.webContents.executeJavaScript(`Boolean(${expression})`, true);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Agent Markdown smoke timed out waiting for: ${expression}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function finish(exitCode) {
  ownerWindow?.destroy();
  await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  app.exit(exitCode);
}

app.whenReady().then(runSmoke).then(() => finish(0)).catch(async (error) => {
  console.error(error);
  await finish(1);
});

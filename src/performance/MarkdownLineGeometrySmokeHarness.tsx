import { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";
import type { DataNode, DataPort, Workspace } from "@puppyone/shared-ui";
import { DataWorkspace } from "@puppyone/shared-ui";

const SOURCE = "before\n\nafter";
const FILE_PATH = "line-geometry.md";
const FONT_SIZES = [12, 14, 16] as const;
const GEOMETRY_TOLERANCE_PX = 0.25;

type LineGeometrySnapshot = {
  height: number;
  followingTop: number;
  paddingTop: number;
  paddingBottom: number;
};

type LineGeometryScenario = {
  fontSize: number;
  empty: LineGeometrySnapshot;
  filled: LineGeometrySnapshot;
  restored: LineGeometrySnapshot;
};

type MarkdownPresentationSnapshot = {
  scrollerFontFamily: string;
  scrollerLineHeight: number;
  contentPaddingBlockStart: number;
  contentPaddingInlineStart: number;
  linePaddingInlineStart: number;
};

type MarkdownLineGeometrySmokeResult = {
  ok: true;
  presentation: MarkdownPresentationSnapshot;
  scenarios: LineGeometryScenario[];
} | {
  error: string;
};

declare global {
  interface Window {
    __PUPPYONE_MARKDOWN_LINE_GEOMETRY_SMOKE_RESULT__?: MarkdownLineGeometrySmokeResult;
  }
}

export function MarkdownLineGeometrySmokeHarness() {
  const startedRef = useRef(false);
  const nodes = useMemo<DataNode[]>(() => [{
    id: FILE_PATH,
    name: FILE_PATH,
    path: FILE_PATH,
    type: "markdown",
  }], []);
  const workspace = useMemo<Workspace>(() => ({
    id: "markdown-line-geometry-smoke",
    name: "Markdown line geometry smoke",
    path: "/markdown-line-geometry-smoke",
    status: "recording",
  }), []);
  const dataPort = useMemo<DataPort>(() => ({
    listChildren: async (folderPath) => folderPath ? [] : nodes,
    readFile: async (path) => ({
      path,
      name: FILE_PATH,
      type: "markdown",
      content: SOURCE,
    }),
  }), [nodes]);

  useEffect(() => {
    let cancelled = false;
    void openDocumentAndRunGeometrySmoke(() => cancelled, startedRef).catch((error: unknown) => {
      if (cancelled) return;
      window.__PUPPYONE_MARKDOWN_LINE_GEOMETRY_SMOKE_RESULT__ = {
        error: error instanceof Error ? error.message : String(error),
      };
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ width: "900px", height: "620px" }}>
      <DataWorkspace
        workspace={workspace}
        dataPort={dataPort}
        showHeader={false}
        showExplorerRoot={false}
        showExplorerToolbar={false}
        showPreviewHeader={false}
        hidePreviewSourceView
        editorSaveMode="manual"
        defaultExplorerWidth={220}
      />
    </div>
  );
}

async function openDocumentAndRunGeometrySmoke(
  isCancelled: () => boolean,
  startedRef: { current: boolean },
) {
  const fileButton = await waitForElement<HTMLButtonElement>(
    `[data-explorer-path="${FILE_PATH}"]`,
    isCancelled,
  );
  if (isCancelled()) return;
  fileButton.click();
  const host = await waitForElement<HTMLElement>(
    '.markdown-codemirror-editor[data-preview-state="ready"]',
    isCancelled,
  );
  if (isCancelled() || startedRef.current) return;
  startedRef.current = true;
  const presentation = readPresentationSnapshot(host);
  assertPresentationContract(presentation);
  const scenarios = await runGeometrySmoke(host);
  if (isCancelled()) return;
  window.__PUPPYONE_MARKDOWN_LINE_GEOMETRY_SMOKE_RESULT__ = {
    ok: true,
    presentation,
    scenarios,
  };
}

function readPresentationSnapshot(host: HTMLElement): MarkdownPresentationSnapshot {
  const scroller = host.querySelector<HTMLElement>(".cm-scroller");
  const content = host.querySelector<HTMLElement>(".cm-content");
  const line = host.querySelector<HTMLElement>(".cm-line");
  if (!scroller || !content || !line) {
    throw new Error("Markdown presentation smoke could not resolve CodeMirror layout nodes.");
  }
  const scrollerStyle = getComputedStyle(scroller);
  const contentStyle = getComputedStyle(content);
  const lineStyle = getComputedStyle(line);
  return {
    scrollerFontFamily: scrollerStyle.fontFamily,
    scrollerLineHeight: round(Number.parseFloat(scrollerStyle.lineHeight)),
    contentPaddingBlockStart: round(Number.parseFloat(contentStyle.paddingBlockStart)),
    contentPaddingInlineStart: round(Number.parseFloat(contentStyle.paddingInlineStart)),
    linePaddingInlineStart: round(Number.parseFloat(lineStyle.paddingInlineStart)),
  };
}

function assertPresentationContract(snapshot: MarkdownPresentationSnapshot) {
  if (/monospace/i.test(snapshot.scrollerFontFamily)) {
    throw new Error(`Markdown presentation fell back to CodeMirror monospace: ${snapshot.scrollerFontFamily}.`);
  }
  assertNear(snapshot.scrollerLineHeight, 24, "14px Markdown reading line height");
  assertNear(snapshot.contentPaddingBlockStart, 64, "Markdown document block inset");
  assertNear(snapshot.contentPaddingInlineStart, 64, "Markdown document minimum inline gutter");
  assertNear(snapshot.linePaddingInlineStart, 0, "Markdown line inline padding");
}

async function runGeometrySmoke(host: HTMLElement): Promise<LineGeometryScenario[]> {
  await waitForAnimationFrames(2);
  const view = EditorView.findFromDOM(host);
  if (!view) throw new Error("Markdown line-geometry smoke could not resolve the EditorView.");
  if (view.state.doc.toString() !== SOURCE) {
    throw new Error("Markdown line-geometry smoke started with unexpected source content.");
  }

  const scenarios: LineGeometryScenario[] = [];
  for (const fontSize of FONT_SIZES) {
    host.style.setProperty("--po-text-size-content", `${fontSize}px`);
    view.requestMeasure();
    await waitForAnimationFrames(2);

    const empty = readLineGeometry(host, true);
    const emptyLine = view.state.doc.line(2);
    view.dispatch({
      changes: { from: emptyLine.from, to: emptyLine.to, insert: "x" },
    });
    await waitForAnimationFrames(2);
    const filled = readLineGeometry(host, false);

    const filledLine = view.state.doc.line(2);
    view.dispatch({
      changes: { from: filledLine.from, to: filledLine.to, insert: "" },
    });
    await waitForAnimationFrames(2);
    const restored = readLineGeometry(host, true);

    assertNear(empty.paddingTop, filled.paddingTop, `${fontSize}px empty/filled padding-top`);
    assertNear(empty.paddingBottom, filled.paddingBottom, `${fontSize}px empty/filled padding-bottom`);
    assertNear(empty.height, filled.height, `${fontSize}px empty/filled line height`);
    assertNear(empty.followingTop, filled.followingTop, `${fontSize}px following-line position after insert`);
    assertNear(empty.height, restored.height, `${fontSize}px restored empty-line height`);
    assertNear(empty.followingTop, restored.followingTop, `${fontSize}px following-line position after delete`);
    scenarios.push({ fontSize, empty, filled, restored });
  }
  return scenarios;
}

function readLineGeometry(host: HTMLElement, expectEmpty: boolean): LineGeometrySnapshot {
  const lines = Array.from(host.querySelectorAll<HTMLElement>(".cm-line"));
  if (lines.length !== 3) {
    throw new Error(`Expected 3 Markdown source lines, received ${lines.length}.`);
  }
  const line = lines[1];
  const followingLine = lines[2];
  const isEmptyDom = line.childNodes.length === 1 && line.firstChild?.nodeName === "BR";
  if (isEmptyDom !== expectEmpty) {
    throw new Error(`Expected line 2 empty DOM to be ${expectEmpty}, received ${isEmptyDom}.`);
  }
  const rect = line.getBoundingClientRect();
  const style = getComputedStyle(line);
  return {
    height: round(rect.height),
    followingTop: round(followingLine.getBoundingClientRect().top),
    paddingTop: round(Number.parseFloat(style.paddingTop)),
    paddingBottom: round(Number.parseFloat(style.paddingBottom)),
  };
}

function assertNear(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) <= GEOMETRY_TOLERANCE_PX) return;
  throw new Error(
    `${label}: expected ${expected} ± ${GEOMETRY_TOLERANCE_PX}, received ${actual}.`,
  );
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function waitForAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const next = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => next(remaining - 1));
    };
    next(count);
  });
}

async function waitForElement<T extends Element>(
  selector: string,
  isCancelled: () => boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (isCancelled()) throw new Error(`Cancelled while waiting for ${selector}.`);
    const element = document.querySelector<T>(selector);
    if (element) return element;
    await waitForAnimationFrames(1);
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}

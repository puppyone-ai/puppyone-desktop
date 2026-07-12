import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import {
  EXPLORER_TREE_NODE_DRAG_TYPE,
  subscribeTypographyChanges,
  type Workspace,
} from "@puppyone/shared-ui";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal, type IDisposable, type ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { TerminalSurfaceHeader } from "./TerminalSurfaceHeader";
import "./desktop-terminal.css";

type RightTerminalPanelProps = {
  workspace: Workspace;
  active: boolean;
};

type TerminalSize = {
  cols: number;
  rows: number;
};

export function RightTerminalPanel({ workspace, active }: RightTerminalPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const terminalSessionReadyRef = useRef(false);
  const pendingTerminalSizeRef = useRef<TerminalSize | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const fitSettleTimersRef = useRef<number[]>([]);
  const activeRef = useRef(active);
  const [hasStarted, setHasStarted] = useState(active);
  const [sessionGeneration, setSessionGeneration] = useState(0);

  const handleClearTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.clear();
    terminal.focus();
  }, []);

  const handleResetTerminal = useCallback(() => {
    setSessionGeneration((generation) => generation + 1);
  }, []);

  const handleTerminalDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!hasTerminalDroppablePaths(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleTerminalDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const paths = readTerminalDroppedPaths(event.dataTransfer, workspace.path);
    if (paths.length === 0) return;

    event.preventDefault();
    event.stopPropagation();

    const sessionId = sessionIdRef.current;
    const bridge = window.puppyoneDesktop;
    if (!sessionId || !bridge?.writeTerminal) return;

    bridge.writeTerminal({
      id: sessionId,
      data: paths.map(shellQuotePath).join(" "),
    });
    terminalRef.current?.focus();
  }, [workspace.path]);

  useEffect(() => {
    activeRef.current = active;
    if (active) setHasStarted(true);
  }, [active]);

  const syncTerminalSizeToPty = useCallback((size: TerminalSize) => {
    const sessionId = sessionIdRef.current;
    const bridge = window.puppyoneDesktop;

    pendingTerminalSizeRef.current = size;
    if (!terminalSessionReadyRef.current || !sessionId || !bridge?.resizeTerminal) return;

    bridge.resizeTerminal({
      id: sessionId,
      cols: size.cols,
      rows: size.rows,
    });
  }, []);

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    const fitTarget = containerRef.current;
    if (!terminal || !fitAddon || !fitTarget) return;

    const rect = fitTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    try {
      fitAddon.fit();
    } catch {
      return;
    }

    syncTerminalSizeToPty({
      cols: terminal.cols,
      rows: terminal.rows,
    });
  }, [syncTerminalSizeToPty]);

  const scheduleFitAndResize = useCallback(() => {
    if (fitFrameRef.current !== null) return;
    fitFrameRef.current = requestAnimationFrame(() => {
      fitFrameRef.current = null;
      fitAndResize();
    });
  }, [fitAndResize]);

  const clearSettledFits = useCallback(() => {
    fitSettleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    fitSettleTimersRef.current = [];
  }, []);

  const scheduleSettledFits = useCallback(() => {
    clearSettledFits();
    scheduleFitAndResize();
    fitSettleTimersRef.current = [80, 180, 260].map((delay) => window.setTimeout(() => {
      if (activeRef.current) scheduleFitAndResize();
    }, delay));
  }, [clearSettledFits, scheduleFitAndResize]);

  useEffect(() => {
    if (!hasStarted || !containerRef.current) return undefined;

    let disposed = false;
    const bridge = window.puppyoneDesktop;
    const terminalTheme = readTerminalTheme(containerRef.current);
    const terminal = new Terminal({
      allowProposedApi: true,
      customGlyphs: true,
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: true,
      fontFamily: readTerminalFontFamily(containerRef.current),
      fontSize: readTerminalFontSize(containerRef.current),
      fontWeight: 450,
      fontWeightBold: 700,
      letterSpacing: 0,
      lineHeight: 1.24,
      rescaleOverlappingGlyphs: true,
      scrollback: 6000,
      theme: terminalTheme,
    });
    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();
    const sessionId = createTerminalId();
    const disposables: Array<{ dispose: () => void }> = [];
    let removeDataListener: (() => void) | undefined;
    let removeExitListener: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let fitTimers: number[] = [];
    let terminalSidebarElement: Element | null = null;
    let handleSidebarTransitionEnd: ((event: Event) => void) | undefined;
    let webglAddon: WebglAddon | null = null;
    let webglContextLossDisposable: IDisposable | null = null;

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    sessionIdRef.current = sessionId;
    terminalSessionReadyRef.current = false;
    pendingTerminalSizeRef.current = null;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    activateUnicode11(terminal);
    terminal.open(containerRef.current);
    const webglRenderer = loadWebglRenderer(terminal, () => {
      safeDispose(webglContextLossDisposable);
      webglContextLossDisposable = null;
      safeDispose(webglAddon);
      webglAddon = null;
      scheduleSettledFits();
    });
    webglAddon = webglRenderer?.addon ?? null;
    webglContextLossDisposable = webglRenderer?.contextLossDisposable ?? null;
    fitAndResize();
    if (webglAddon) scheduleFitAndResize();

    const writeSystemLine = (message: string) => {
      terminal.writeln(`\x1b[38;5;244m${message}\x1b[0m`);
    };

    if (!bridge?.createTerminal || !bridge.writeTerminal || !bridge.onTerminalData || !bridge.onTerminalExit) {
      writeSystemLine("Terminal bridge unavailable. Open this workspace in puppyone.");
      return () => {
        disposed = true;
        safeDispose(webglContextLossDisposable);
        safeDispose(webglAddon);
        safeDispose(unicode11Addon);
        disposables.forEach((disposable) => disposable.dispose());
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
        sessionIdRef.current = null;
      };
    }

    removeDataListener = bridge.onTerminalData((event) => {
      if (event.id !== sessionId || disposed) return;
      terminal.write(event.data);
    });

    removeExitListener = bridge.onTerminalExit((event) => {
      if (event.id !== sessionId || disposed) return;
      const exitText = event.signal ? `signal ${event.signal}` : `code ${event.code ?? 0}`;
      terminal.writeln(`\r\n\x1b[38;5;244mProcess exited with ${exitText}.\x1b[0m`);
    });

    disposables.push(terminal.onData((data) => {
      bridge.writeTerminal({
        id: sessionId,
        data,
      });
    }));

    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (activeRef.current) scheduleFitAndResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    terminalSidebarElement = containerRef.current?.closest(".desktop-right-sidebar") ?? null;
    if (terminalSidebarElement) {
      handleSidebarTransitionEnd = (event: Event) => {
        const transitionEvent = event as TransitionEvent;
        if (transitionEvent.target !== terminalSidebarElement) return;
        if (transitionEvent.propertyName !== "width" && transitionEvent.propertyName !== "flex-basis") return;
        if (activeRef.current) scheduleFitAndResize();
      };
      terminalSidebarElement.addEventListener("transitionend", handleSidebarTransitionEnd);
    }

    requestAnimationFrame(() => {
      if (disposed) return;
      fitAndResize();
      if (activeRef.current) terminal.focus();
    });

    fitTimers = [80, 180, 260].map((delay) => window.setTimeout(() => {
      if (!disposed && activeRef.current) fitAndResize();
    }, delay));

    void document.fonts?.ready.then(() => {
      if (!disposed && activeRef.current) scheduleFitAndResize();
    });

    void bridge.createTerminal({
      id: sessionId,
      cwd: workspace.path,
      cols: terminal.cols,
      rows: terminal.rows,
    }).then((result) => {
      if (disposed) {
        void bridge.closeTerminal(result.id);
        return;
      }
      terminalSessionReadyRef.current = true;
      syncTerminalSizeToPty(pendingTerminalSizeRef.current ?? {
        cols: terminal.cols,
        rows: terminal.rows,
      });
      if (activeRef.current) terminal.focus();
    }).catch((error) => {
      if (disposed) return;
      writeSystemLine(formatTerminalError(error));
    });

    return () => {
      disposed = true;
      terminalSessionReadyRef.current = false;
      pendingTerminalSizeRef.current = null;
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
      fitTimers.forEach((timer) => window.clearTimeout(timer));
      clearSettledFits();
      resizeObserver?.disconnect();
      if (terminalSidebarElement && handleSidebarTransitionEnd) {
        terminalSidebarElement.removeEventListener("transitionend", handleSidebarTransitionEnd);
      }
      removeDataListener?.();
      removeExitListener?.();
      safeDispose(webglContextLossDisposable);
      safeDispose(webglAddon);
      safeDispose(unicode11Addon);
      disposables.forEach((disposable) => disposable.dispose());
      void bridge.closeTerminal(sessionId);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      sessionIdRef.current = null;
    };
  }, [
    clearSettledFits,
    fitAndResize,
    hasStarted,
    scheduleFitAndResize,
    scheduleSettledFits,
    sessionGeneration,
    syncTerminalSizeToPty,
    workspace.path,
  ]);

  useEffect(() => {
    if (!hasStarted) return undefined;

    const applyTheme = () => {
      if (!containerRef.current || !terminalRef.current) return;
      applyTerminalTheme(terminalRef.current, containerRef.current);
      scheduleSettledFits();
    };
    const shell = containerRef.current?.closest(".app-shell");
    applyTheme();

    if (!shell) return undefined;
    const shellObserver = new MutationObserver(applyTheme);
    shellObserver.observe(shell, {
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-theme-mode",
        "data-light-theme-preset",
        "data-dark-theme-preset",
        "data-text-size",
        "data-font-terminal",
      ],
    });
    const styleObserver = new MutationObserver(applyTheme);
    styleObserver.observe(document.head, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["href", "style"],
    });
    const unsubscribeTypography = subscribeTypographyChanges(document, applyTheme);
    return () => {
      shellObserver.disconnect();
      styleObserver.disconnect();
      unsubscribeTypography();
    };
  }, [hasStarted, scheduleSettledFits, sessionGeneration]);

  useEffect(() => {
    if (!active) return undefined;
    const frame = requestAnimationFrame(() => {
      scheduleSettledFits();
      terminalRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      clearSettledFits();
    };
  }, [active, clearSettledFits, scheduleSettledFits]);

  return (
    <section className="desktop-terminal-panel" aria-label="Terminal">
      <TerminalSurfaceHeader onClear={handleClearTerminal} onReset={handleResetTerminal} />
      <div className="desktop-terminal-body" ref={bodyRef}>
        <div
          className="desktop-terminal-xterm"
          ref={containerRef}
          onDragOver={handleTerminalDragOver}
          onDrop={handleTerminalDrop}
        />
      </div>
    </section>
  );
}

type WebglRendererHandle = {
  addon: WebglAddon;
  contextLossDisposable: IDisposable;
};

function activateUnicode11(terminal: Terminal) {
  try {
    terminal.unicode.activeVersion = "11";
  } catch {
    // Keep the terminal usable if the proposed Unicode API is unavailable.
  }
}

function loadWebglRenderer(terminal: Terminal, onContextLoss: () => void): WebglRendererHandle | null {
  let addon: WebglAddon | null = null;
  let contextLossDisposable: IDisposable | null = null;

  try {
    addon = new WebglAddon();
    contextLossDisposable = addon.onContextLoss(onContextLoss);
    terminal.loadAddon(addon);
    return {
      addon,
      contextLossDisposable,
    };
  } catch {
    safeDispose(contextLossDisposable);
    safeDispose(addon);
    return null;
  }
}

function safeDispose(disposable: { dispose: () => void } | null | undefined) {
  try {
    disposable?.dispose();
  } catch {
    // Disposal should never break terminal teardown.
  }
}

function hasExplorerNodePath(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(EXPLORER_TREE_NODE_DRAG_TYPE);
}

function hasTerminalDroppablePaths(dataTransfer: DataTransfer) {
  return hasExplorerNodePath(dataTransfer) || hasDataTransferFiles(dataTransfer);
}

function hasDataTransferFiles(dataTransfer: DataTransfer) {
  if (dataTransfer.files.length > 0) return true;
  if (Array.from(dataTransfer.types).includes("Files")) return true;
  return Array.from(dataTransfer.items).some((item) => item.kind === "file");
}

function readTerminalDroppedPaths(dataTransfer: DataTransfer, rootPath: string) {
  const explorerPaths = readExplorerNodePaths(dataTransfer)
    .map((nodePath) => joinWorkspacePath(rootPath, nodePath));
  if (explorerPaths.length > 0) return explorerPaths;

  return Array.from(dataTransfer.files)
    .map(readDroppedFilePath)
    .filter((pathValue): pathValue is string => Boolean(pathValue));
}

function readExplorerNodePaths(dataTransfer: DataTransfer) {
  if (!hasExplorerNodePath(dataTransfer)) return [];
  return dataTransfer
    .getData(EXPLORER_TREE_NODE_DRAG_TYPE)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function readDroppedFilePath(file: File) {
  const bridgePath = window.puppyoneDesktop?.getPathForFile?.(file);
  const legacyPath = (file as File & { path?: string }).path;
  const pathValue = bridgePath || legacyPath || "";
  return pathValue.trim() || null;
}

function joinWorkspacePath(rootPath: string, nodePath: string) {
  const cleanNodePath = nodePath.trim().replace(/^[/\\]+/, "");
  if (!cleanNodePath) return rootPath;
  const separator = /[/\\]$/.test(rootPath) ? "" : "/";
  return `${rootPath}${separator}${cleanNodePath}`;
}

function shellQuotePath(pathValue: string) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(pathValue)) return pathValue;
  return `'${pathValue.replace(/'/g, "'\\''")}'`;
}

function readTerminalTheme(element: HTMLElement): ITheme {
  return {
    background: cssColor(element, "--po-terminal-bg", cssColor(element, "--po-surface-terminal", "#fbf6ed")),
    foreground: cssColor(element, "--po-terminal-fg", cssColor(element, "--po-text", "#2f2a23")),
    cursor: cssColor(element, "--po-terminal-cursor", cssColor(element, "--po-text", "#2f2a23")),
    selectionBackground: cssColor(element, "--po-terminal-selection", cssColor(element, "--po-selected", "rgba(73, 55, 35, 0.17)")),
    scrollbarSliderBackground: "transparent",
    scrollbarSliderHoverBackground: "transparent",
    scrollbarSliderActiveBackground: "transparent",
    overviewRulerBorder: "transparent",
    black: cssColor(element, "--po-terminal-black", cssColor(element, "--po-text", "#2f2a23")),
    red: cssColor(element, "--po-terminal-red", cssColor(element, "--po-danger", "#dc2626")),
    green: cssColor(element, "--po-terminal-green", cssColor(element, "--po-success", "#15803d")),
    yellow: cssColor(element, "--po-terminal-yellow", cssColor(element, "--po-warning", "#b45309")),
    blue: cssColor(element, "--po-terminal-blue", cssColor(element, "--po-accent", "#2563eb")),
    magenta: cssColor(element, "--po-terminal-magenta", cssColor(element, "--po-purple", "#8057a8")),
    cyan: cssColor(element, "--po-terminal-cyan", cssColor(element, "--po-info", "#0284c7")),
    white: cssColor(element, "--po-terminal-white", cssColor(element, "--po-inset", "#e6ded1")),
    brightBlack: cssColor(element, "--po-terminal-bright-black", cssColor(element, "--po-text-muted", "#70685e")),
    brightRed: cssColor(element, "--po-terminal-bright-red", cssColor(element, "--po-danger", "#dc2626")),
    brightGreen: cssColor(element, "--po-terminal-bright-green", cssColor(element, "--po-success", "#15803d")),
    brightYellow: cssColor(element, "--po-terminal-bright-yellow", cssColor(element, "--po-warning", "#b45309")),
    brightBlue: cssColor(element, "--po-terminal-bright-blue", cssColor(element, "--po-accent", "#2563eb")),
    brightMagenta: cssColor(element, "--po-terminal-bright-magenta", cssColor(element, "--po-purple", "#8057a8")),
    brightCyan: cssColor(element, "--po-terminal-bright-cyan", cssColor(element, "--po-info", "#0284c7")),
    brightWhite: cssColor(element, "--po-terminal-bright-white", cssColor(element, "--po-text", "#2f2a23")),
  };
}

function applyTerminalTheme(terminal: Terminal, element: HTMLElement) {
  terminal.options.theme = readTerminalTheme(element);
  terminal.options.fontFamily = readTerminalFontFamily(element);
  terminal.options.fontSize = readTerminalFontSize(element);
  terminal.refresh(0, Math.max(0, terminal.rows - 1));
}

function readTerminalFontFamily(element: HTMLElement) {
  return getComputedStyle(element).getPropertyValue("--po-font-terminal").trim()
    || '"Geist Mono", "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace';
}

function readTerminalFontSize(element: HTMLElement) {
  const value = getComputedStyle(element).getPropertyValue("--po-code-font-size").trim();
  const fontSize = Number.parseFloat(value);
  return Number.isInteger(fontSize) ? fontSize : 13;
}

function cssColor(element: HTMLElement, name: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return resolveCssColor(element, value || fallback);
}

function resolveCssColor(element: HTMLElement, color: string) {
  const probe = document.createElement("span");
  probe.style.color = color;
  if (!probe.style.color && !color.includes("var(") && !color.includes("color-mix(")) return color;

  probe.style.display = "none";
  element.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || color;
}

function formatTerminalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered for 'terminal:create'")) {
    return "Terminal runtime was updated. Restart puppyone once so the native bridge can load.";
  }
  return message;
}

function createTerminalId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `terminal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

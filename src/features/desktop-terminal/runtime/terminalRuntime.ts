import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal, type IDisposable } from "@xterm/xterm";
import type { DesktopTerminalSessionStatus } from "../model/terminalSessions";
import {
  applyTerminalAppearance,
  readTerminalFontFamily,
  readTerminalFontSize,
  readTerminalTheme,
} from "./terminalAppearance";

type TerminalSize = {
  cols: number;
  rows: number;
};

type TerminalRuntimeOptions = {
  sessionId: string;
  initialCommand?: string | null;
  workspacePath: string;
  getMessageFormatter: () => MessageFormatter;
  onStatus: (
    sessionId: string,
    status: DesktopTerminalSessionStatus,
    shell?: string | null,
  ) => void;
};

export interface TerminalRuntimeHandle {
  readonly ready: boolean;
  readonly title: string;
  applyAppearance: () => void;
  dispose: () => void;
  focus: () => void;
  mount: (container: HTMLDivElement) => void;
  setActive: (active: boolean) => void;
  subscribeReady: (listener: (ready: boolean) => void) => () => void;
  subscribeTitle: (listener: (title: string) => void) => () => void;
  write: (data: string) => void;
}

export class TerminalRuntime implements TerminalRuntimeHandle {
  private readonly sessionId: string;
  private readonly initialCommand: string | null;
  private readonly workspacePath: string;
  private readonly getMessageFormatter: () => MessageFormatter;
  private readonly onStatus: TerminalRuntimeOptions["onStatus"];
  private readonly readyListeners = new Set<(ready: boolean) => void>();
  private readonly titleListeners = new Set<(title: string) => void>();
  private readonly disposables: IDisposable[] = [];
  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private unicode11Addon: Unicode11Addon | null = null;
  private webglAddon: WebglAddon | null = null;
  private webglContextLossDisposable: IDisposable | null = null;
  private container: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private terminalSidebarElement: Element | null = null;
  private sidebarTransitionEndListener: ((event: Event) => void) | null = null;
  private removeDataListener: (() => void) | null = null;
  private removeExitListener: (() => void) | null = null;
  private fitFrame: number | null = null;
  private revealFrame: number | null = null;
  private scrollbarIdleTimer: number | null = null;
  private pendingPtySize: TerminalSize | null = null;
  private lastPtySize: TerminalSize | null = null;
  private ptyReady = false;
  private active = false;
  private disposed = false;
  private viewReady = false;
  private terminalTitle = "";

  constructor({
    sessionId,
    initialCommand = null,
    workspacePath,
    getMessageFormatter,
    onStatus,
  }: TerminalRuntimeOptions) {
    this.sessionId = sessionId;
    this.initialCommand = initialCommand;
    this.workspacePath = workspacePath;
    this.getMessageFormatter = getMessageFormatter;
    this.onStatus = onStatus;
  }

  get ready() {
    return this.viewReady;
  }

  get title() {
    return this.terminalTitle;
  }

  mount(container: HTMLDivElement) {
    if (this.disposed) return;
    if (this.container && this.container !== container) {
      throw new Error(`Terminal runtime ${this.sessionId} is already mounted.`);
    }
    this.container = container;
    if (this.terminal) {
      this.scheduleFit();
      return;
    }
    this.initializeTerminal(container);
  }

  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (!active) return;
    this.scheduleFit();
    requestAnimationFrame(() => {
      if (!this.disposed && this.active) this.terminal?.focus();
    });
  }

  focus() {
    if (!this.disposed) this.terminal?.focus();
  }

  write(data: string) {
    if (this.disposed || data.length === 0) return;
    window.puppyoneDesktop?.writeTerminal?.({
      id: this.sessionId,
      data,
    });
  }

  subscribeReady(listener: (ready: boolean) => void) {
    this.readyListeners.add(listener);
    listener(this.viewReady);
    return () => this.readyListeners.delete(listener);
  }

  subscribeTitle(listener: (title: string) => void) {
    this.titleListeners.add(listener);
    listener(this.terminalTitle);
    return () => this.titleListeners.delete(listener);
  }

  applyAppearance() {
    if (this.disposed || !this.container || !this.terminal) return;
    applyTerminalAppearance(this.terminal, this.container);
    this.scheduleFit();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ptyReady = false;
    this.pendingPtySize = null;
    this.lastPtySize = null;
    this.setReady(false);
    this.readyListeners.clear();
    this.titleListeners.clear();

    if (this.fitFrame !== null) cancelAnimationFrame(this.fitFrame);
    if (this.revealFrame !== null) cancelAnimationFrame(this.revealFrame);
    if (this.scrollbarIdleTimer !== null) window.clearTimeout(this.scrollbarIdleTimer);
    this.fitFrame = null;
    this.revealFrame = null;
    this.scrollbarIdleTimer = null;
    this.container?.classList.remove("po-scrollbar-active");
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.terminalSidebarElement && this.sidebarTransitionEndListener) {
      this.terminalSidebarElement.removeEventListener(
        "transitionend",
        this.sidebarTransitionEndListener,
      );
    }
    this.terminalSidebarElement = null;
    this.sidebarTransitionEndListener = null;
    this.removeDataListener?.();
    this.removeExitListener?.();
    this.removeDataListener = null;
    this.removeExitListener = null;
    safeDispose(this.webglContextLossDisposable);
    safeDispose(this.webglAddon);
    safeDispose(this.unicode11Addon);
    this.webglContextLossDisposable = null;
    this.webglAddon = null;
    this.unicode11Addon = null;
    this.disposables.splice(0).forEach(safeDispose);
    void window.puppyoneDesktop?.closeTerminal?.(this.sessionId);
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
    this.container = null;
  }

  private initializeTerminal(container: HTMLDivElement) {
    const terminal = new Terminal({
      allowProposedApi: true,
      customGlyphs: true,
      cursorBlink: true,
      cursorStyle: "block",
      convertEol: true,
      fontFamily: readTerminalFontFamily(container),
      fontSize: readTerminalFontSize(container),
      fontWeight: 450,
      fontWeightBold: 700,
      letterSpacing: 0,
      lineHeight: 1.24,
      linkHandler: {
        activate: (_event, href) => this.openExternalUrl(href),
        allowNonHttpProtocols: false,
      },
      rescaleOverlappingGlyphs: true,
      scrollback: 6000,
      theme: readTerminalTheme(container),
    });
    const fitAddon = new FitAddon();
    const unicode11Addon = new Unicode11Addon();

    this.terminal = terminal;
    this.fitAddon = fitAddon;
    this.unicode11Addon = unicode11Addon;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11Addon);
    terminal.loadAddon(new WebLinksAddon((_event, href) => this.openExternalUrl(href)));
    activateUnicode11(terminal);
    this.disposables.push(
      terminal.onRender(() => this.setReady(true)),
      terminal.onData((data) => this.write(data)),
      terminal.onScroll(() => this.markScrollbarActive()),
      terminal.onTitleChange((title) => this.setTitle(title)),
    );
    terminal.open(container);
    this.loadWebglRenderer();
    this.fitNow();
    this.setReady(true);
    this.observeSize(container);
    this.observeSidebarTransition(container);
    this.subscribeBridge();

    this.revealFrame = requestAnimationFrame(() => {
      this.revealFrame = null;
      if (this.disposed) return;
      this.fitNow();
      if (this.active) terminal.focus();
    });

    void document.fonts?.ready.then(() => {
      if (!this.disposed) this.scheduleFit();
    });

    this.startPty();
  }

  private markScrollbarActive() {
    const container = this.container;
    if (!container) return;
    container.classList.add("po-scrollbar-active");
    if (this.scrollbarIdleTimer !== null) window.clearTimeout(this.scrollbarIdleTimer);
    this.scrollbarIdleTimer = window.setTimeout(() => {
      this.scrollbarIdleTimer = null;
      container.classList.remove("po-scrollbar-active");
    }, 900);
  }

  private subscribeBridge() {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.onTerminalData || !bridge.onTerminalExit) return;

    this.removeDataListener = bridge.onTerminalData((event) => {
      if (event.id !== this.sessionId || this.disposed) return;
      this.terminal?.write(event.data);
    });
    this.removeExitListener = bridge.onTerminalExit((event) => {
      if (event.id !== this.sessionId || this.disposed) return;
      const exitText = event.signal
        ? this.message("terminal.processExitedSignal", { signal: bidiIsolate(event.signal) })
        : this.message("terminal.processExitedCode", { code: event.code ?? 0 });
      this.terminal?.writeln(`\r\n\x1b[38;5;244m${exitText}\x1b[0m`);
      this.ptyReady = false;
      this.onStatus(this.sessionId, "exited");
    });
  }

  private startPty() {
    const bridge = window.puppyoneDesktop;
    this.onStatus(this.sessionId, "starting");
    if (!bridge?.createTerminal || !bridge.writeTerminal || !bridge.resizeTerminal) {
      this.writeSystemLine(this.message("terminal.bridgeUnavailable"));
      this.onStatus(this.sessionId, "error");
      return;
    }

    const terminal = this.terminal;
    if (!terminal) return;
    void bridge.createTerminal({
      id: this.sessionId,
      cwd: this.workspacePath,
      cols: terminal.cols,
      rows: terminal.rows,
    }).then((result) => {
      if (this.disposed) {
        void bridge.closeTerminal(result.id);
        return;
      }
      this.ptyReady = true;
      this.onStatus(this.sessionId, "running", result.shell);
      this.syncSizeToPty(this.pendingPtySize ?? {
        cols: terminal.cols,
        rows: terminal.rows,
      });
      if (this.initialCommand) {
        bridge.writeTerminal({
          id: this.sessionId,
          data: `${this.initialCommand}\r`,
        });
      }
      if (this.active) terminal.focus();
    }).catch((error) => {
      if (this.disposed) return;
      this.onStatus(this.sessionId, "error");
      this.writeSystemLine(formatTerminalError(error, this.getMessageFormatter()));
    });
  }

  private observeSize(container: HTMLDivElement) {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.active) this.scheduleFit();
    });
    this.resizeObserver.observe(container);
  }

  private observeSidebarTransition(container: HTMLDivElement) {
    this.terminalSidebarElement = container.closest(".desktop-right-sidebar");
    if (!this.terminalSidebarElement) return;
    this.sidebarTransitionEndListener = (event: Event) => {
      const transitionEvent = event as TransitionEvent;
      if (transitionEvent.target !== this.terminalSidebarElement) return;
      if (transitionEvent.propertyName !== "width" && transitionEvent.propertyName !== "flex-basis") {
        return;
      }
      if (this.active) this.scheduleFit();
    };
    this.terminalSidebarElement.addEventListener(
      "transitionend",
      this.sidebarTransitionEndListener,
    );
  }

  private scheduleFit() {
    if (this.disposed || this.fitFrame !== null) return;
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = null;
      this.fitNow();
    });
  }

  private fitNow() {
    const terminal = this.terminal;
    const fitAddon = this.fitAddon;
    const container = this.container;
    if (!terminal || !fitAddon || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    try {
      fitAddon.fit();
    } catch {
      return;
    }
    this.syncSizeToPty({ cols: terminal.cols, rows: terminal.rows });
  }

  private syncSizeToPty(size: TerminalSize) {
    this.pendingPtySize = size;
    if (!this.ptyReady || this.disposed) return;
    if (sameTerminalSize(this.lastPtySize, size)) return;
    const bridge = window.puppyoneDesktop;
    if (!bridge?.resizeTerminal) return;
    this.lastPtySize = size;
    bridge.resizeTerminal({
      id: this.sessionId,
      cols: size.cols,
      rows: size.rows,
    });
  }

  private loadWebglRenderer() {
    const terminal = this.terminal;
    if (!terminal) return;
    try {
      const addon = new WebglAddon();
      const contextLossDisposable = addon.onContextLoss(() => {
        safeDispose(this.webglContextLossDisposable);
        safeDispose(this.webglAddon);
        this.webglContextLossDisposable = null;
        this.webglAddon = null;
        this.scheduleFit();
      });
      terminal.loadAddon(addon);
      this.webglAddon = addon;
      this.webglContextLossDisposable = contextLossDisposable;
    } catch {
      safeDispose(this.webglContextLossDisposable);
      safeDispose(this.webglAddon);
      this.webglContextLossDisposable = null;
      this.webglAddon = null;
    }
  }

  private openExternalUrl(href: string) {
    const bridge = window.puppyoneDesktop;
    if (!bridge?.openExternalUrl) {
      this.writeSystemLine(this.message("terminal.bridgeUnavailable"));
      return;
    }
    void bridge.openExternalUrl(href).catch((error) => {
      this.writeSystemLine(formatTerminalError(error, this.getMessageFormatter()));
    });
  }

  private writeSystemLine(message: string) {
    this.terminal?.writeln(`\x1b[38;5;244m${message}\x1b[0m`);
  }

  private message(key: Parameters<MessageFormatter>[0], params?: Parameters<MessageFormatter>[1]) {
    return this.getMessageFormatter()(key, params);
  }

  private setReady(ready: boolean) {
    if (this.viewReady === ready) return;
    this.viewReady = ready;
    this.readyListeners.forEach((listener) => listener(ready));
  }

  private setTitle(title: string) {
    if (this.terminalTitle === title) return;
    this.terminalTitle = title;
    this.titleListeners.forEach((listener) => listener(title));
  }
}

function sameTerminalSize(left: TerminalSize | null, right: TerminalSize) {
  return left?.cols === right.cols && left.rows === right.rows;
}

function activateUnicode11(terminal: Terminal) {
  try {
    terminal.unicode.activeVersion = "11";
  } catch {
    // Keep the terminal usable if the proposed Unicode API is unavailable.
  }
}

function safeDispose(disposable: { dispose: () => void } | null | undefined) {
  try {
    disposable?.dispose();
  } catch {
    // Disposal should never break terminal teardown.
  }
}

function formatTerminalError(error: unknown, t: MessageFormatter) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No handler registered for 'terminal:create'")) {
    return t("terminal.runtimeRestartRequired");
  }
  return t("terminal.errorDetail", { detail: bidiIsolate(message) });
}

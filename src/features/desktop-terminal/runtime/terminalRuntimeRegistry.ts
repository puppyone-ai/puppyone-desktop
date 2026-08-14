import type { MessageFormatter } from "@puppyone/localization/core";
import type { DesktopTerminalSessionStatus } from "../model/terminalSessions";
import { TerminalRuntime, type TerminalRuntimeHandle } from "./terminalRuntime";

type TerminalRuntimeFactoryOptions = {
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

export type TerminalRuntimeFactory = (
  options: TerminalRuntimeFactoryOptions,
) => TerminalRuntimeHandle;

type TerminalRuntimeRegistryOptions = Omit<TerminalRuntimeFactoryOptions, "sessionId"> & {
  createRuntime?: TerminalRuntimeFactory;
};

export class TerminalRuntimeRegistry {
  private readonly workspacePath: string;
  private readonly getMessageFormatter: () => MessageFormatter;
  private readonly onStatus: TerminalRuntimeFactoryOptions["onStatus"];
  private readonly createRuntime: TerminalRuntimeFactory;
  private readonly runtimes = new Map<string, TerminalRuntimeHandle>();
  private retainCount = 0;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor({
    workspacePath,
    getMessageFormatter,
    onStatus,
    createRuntime = (options) => new TerminalRuntime(options),
  }: TerminalRuntimeRegistryOptions) {
    this.workspacePath = workspacePath;
    this.getMessageFormatter = getMessageFormatter;
    this.onStatus = onStatus;
    this.createRuntime = createRuntime;
  }

  ensure(sessionId: string, initialCommand: string | null = null) {
    const existing = this.runtimes.get(sessionId);
    if (existing) return existing;
    const runtime = this.createRuntime({
      sessionId,
      initialCommand,
      workspacePath: this.workspacePath,
      getMessageFormatter: this.getMessageFormatter,
      onStatus: this.onStatus,
    });
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }

  require(sessionId: string) {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) throw new Error(`Terminal runtime ${sessionId} does not exist.`);
    return runtime;
  }

  close(sessionId: string) {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;
    this.runtimes.delete(sessionId);
    runtime.dispose();
  }

  applyAppearance() {
    this.runtimes.forEach((runtime) => runtime.applyAppearance());
  }

  retain() {
    this.retainCount += 1;
    if (this.disposeTimer === null) return;
    clearTimeout(this.disposeTimer);
    this.disposeTimer = null;
  }

  release() {
    this.retainCount = Math.max(0, this.retainCount - 1);
    if (this.retainCount > 0 || this.disposeTimer !== null) return;
    this.disposeTimer = setTimeout(() => {
      this.disposeTimer = null;
      if (this.retainCount === 0) this.disposeAll();
    }, 0);
  }

  disposeAll() {
    if (this.disposeTimer !== null) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
    const runtimes = Array.from(this.runtimes.values());
    this.runtimes.clear();
    runtimes.forEach((runtime) => runtime.dispose());
  }
}

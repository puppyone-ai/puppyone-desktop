import type { MessageFormatter } from "@puppyone/localization/core";
import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";
import type { DesktopTerminalSessionStatus } from "../model/terminalSessions";
import type { TerminalRuntimeHandle } from "../runtime/terminalRuntime";
import { TerminalRuntimeRegistry } from "../runtime/terminalRuntimeRegistry";

type TerminalRuntimePoolOptions = Readonly<{
  getMessageFormatter: () => MessageFormatter;
  onStatus: (
    itemId: string,
    status: DesktopTerminalSessionStatus,
    shell?: string | null,
    error?: string | null,
  ) => void;
}>;

/**
 * Window-scoped facade over root-scoped Terminal registries. An Item captures
 * its root at creation; later Explorer focus changes never retarget its PTY.
 */
export class TerminalRuntimePool {
  private readonly options: TerminalRuntimePoolOptions;
  private readonly registries = new Map<string, TerminalRuntimeRegistry>();
  private readonly rootByItemId = new Map<string, string>();
  private retainCount = 0;

  constructor(options: TerminalRuntimePoolOptions) {
    this.options = options;
  }

  ensure(
    itemId: string,
    launcherId: DesktopTerminalLauncherId = "shell",
    workspacePath: string,
  ): TerminalRuntimeHandle {
    const existing = this.get(itemId);
    if (existing) return existing;
    const registry = this.requireRegistry(workspacePath);
    this.rootByItemId.set(itemId, workspacePath);
    return registry.ensure(itemId, launcherId);
  }

  get(itemId: string): TerminalRuntimeHandle | null {
    const rootId = this.rootByItemId.get(itemId);
    return rootId ? this.registries.get(rootId)?.get(itemId) ?? null : null;
  }

  require(itemId: string): TerminalRuntimeHandle {
    const runtime = this.get(itemId);
    if (!runtime) throw new Error(`Terminal runtime ${itemId} does not exist.`);
    return runtime;
  }

  close(itemId: string): void {
    const rootId = this.rootByItemId.get(itemId);
    if (!rootId) return;
    this.rootByItemId.delete(itemId);
    this.registries.get(rootId)?.close(itemId);
  }

  applyAppearance(): void {
    this.registries.forEach((registry) => registry.applyAppearance());
  }

  retain(): void {
    this.retainCount += 1;
    this.registries.forEach((registry) => registry.retain());
  }

  release(): void {
    this.retainCount = Math.max(0, this.retainCount - 1);
    this.registries.forEach((registry) => registry.release());
  }

  disposeAll(): void {
    this.rootByItemId.clear();
    this.registries.forEach((registry) => registry.disposeAll());
    this.registries.clear();
  }

  private requireRegistry(workspacePath: string): TerminalRuntimeRegistry {
    const existing = this.registries.get(workspacePath);
    if (existing) return existing;
    const registry = new TerminalRuntimeRegistry({
      workspacePath,
      getMessageFormatter: this.options.getMessageFormatter,
      onStatus: this.options.onStatus,
    });
    for (let index = 0; index < this.retainCount; index += 1) registry.retain();
    this.registries.set(workspacePath, registry);
    return registry;
  }
}

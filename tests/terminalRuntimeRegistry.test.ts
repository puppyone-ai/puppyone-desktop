import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageFormatter } from "@puppyone/localization/core";
import type { TerminalRuntimeHandle } from "../src/features/desktop-terminal/runtime/terminalRuntime";
import {
  TerminalRuntimeRegistry,
  type TerminalRuntimeFactory,
} from "../src/features/desktop-terminal/runtime/terminalRuntimeRegistry";

afterEach(() => {
  vi.useRealTimers();
});

describe("Terminal runtime ownership", () => {
  it("survives the Strict Mode cleanup-and-remount cycle", () => {
    vi.useFakeTimers();
    const harness = createRegistryHarness();
    const runtime = harness.registry.ensure("terminal-a");

    harness.registry.retain();
    harness.registry.release();
    harness.registry.retain();
    vi.runAllTimers();

    expect(runtime.dispose).not.toHaveBeenCalled();
    expect(harness.created).toHaveLength(1);

    harness.registry.release();
    vi.runAllTimers();
    expect(runtime.dispose).toHaveBeenCalledOnce();
  });

  it("keeps one runtime per session and disposes only the explicitly closed session", () => {
    const harness = createRegistryHarness();
    const first = harness.registry.ensure("terminal-a");
    const sameFirst = harness.registry.ensure("terminal-a");
    const second = harness.registry.ensure("terminal-b");

    expect(sameFirst).toBe(first);
    expect(harness.created).toHaveLength(2);

    harness.registry.close("terminal-a");
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();
    expect(harness.registry.require("terminal-b")).toBe(second);
  });

  it("binds a fixed launch command to a newly owned runtime", () => {
    const harness = createRegistryHarness();

    harness.registry.ensure("terminal-codex", "codex");

    expect(harness.createdOptions).toHaveLength(1);
    expect(harness.createdOptions[0]).toMatchObject({
      sessionId: "terminal-codex",
      initialCommand: "codex",
      workspacePath: "/workspace",
    });
  });
});

function createRegistryHarness() {
  const created: TerminalRuntimeHandle[] = [];
  const createdOptions: Array<Parameters<TerminalRuntimeFactory>[0]> = [];
  const createRuntime: TerminalRuntimeFactory = (options) => {
    const runtime: TerminalRuntimeHandle = {
      ready: false,
      title: "",
      applyAppearance: vi.fn(),
      dispose: vi.fn(),
      focus: vi.fn(),
      mount: vi.fn(),
      setActive: vi.fn(),
      subscribeReady: vi.fn(() => () => undefined),
      subscribeTitle: vi.fn(() => () => undefined),
      write: vi.fn(),
    };
    created.push(runtime);
    createdOptions.push(options);
    return runtime;
  };
  const registry = new TerminalRuntimeRegistry({
    workspacePath: "/workspace",
    getMessageFormatter: () => ((key: string) => key) as MessageFormatter,
    onStatus: vi.fn(),
    createRuntime,
  });
  return { created, createdOptions, registry };
}

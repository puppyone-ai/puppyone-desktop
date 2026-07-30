import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createClaudeSpawn } from "../electron/main/agent/runtimes/claude/claude-spawn.mjs";

describe("Claude Code Electron spawn adapter", () => {
  it("routes Node-backed CLI entrypoints through an absolute Node executable", () => {
    const runtimeDirectory = path.resolve("/runtime/bin");
    const nodeExecutable = path.join(runtimeDirectory, process.platform === "win32" ? "node.exe" : "node");
    const claudeEntrypoint = path.resolve("/tools/claude/cli.js");
    const workspace = path.resolve("/workspace");
    const spawn = vi.fn(() => fakeChild());
    const launch = createClaudeSpawn({
      spawn,
      fsModule: {
        constants: { X_OK: 1 },
        accessSync: vi.fn((filename) => {
          if (filename !== nodeExecutable) throw new Error("missing");
        }),
      },
    });

    launch({
      command: claudeEntrypoint,
      args: ["--output-format", "stream-json"],
      cwd: workspace,
      env: { PATH: runtimeDirectory },
    });

    expect(spawn).toHaveBeenCalledWith(
      nodeExecutable,
      [claudeEntrypoint, "--output-format", "stream-json"],
      expect.objectContaining({ cwd: workspace, shell: false }),
    );
  });

  it("rejects relative commands and control characters before spawning", () => {
    const spawn = vi.fn(() => fakeChild());
    const launch = createClaudeSpawn({ spawn });

    expect(() => launch({
      command: "claude",
      args: [],
      cwd: "/workspace",
      env: { PATH: "/usr/bin" },
    })).toThrow("absolute validated path");
    expect(() => launch({
      command: "/tools/claude",
      args: ["--model\nunsafe"],
      cwd: "/workspace",
      env: {},
    })).toThrow("arguments are invalid");
    expect(spawn).not.toHaveBeenCalled();
  });
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

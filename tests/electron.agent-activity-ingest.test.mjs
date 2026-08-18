import { mkdtemp, rm, stat } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHookIngestServer } from "../electron/main/agent-activity/transport/hook-ingest-server.mjs";
import { createHookSessionAuth } from "../electron/main/agent-activity/transport/hook-session-auth.mjs";

const cleanups = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("Agent activity local ingest", () => {
  it("accepts one authenticated local frame and rejects a stale token", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "puppyone-activity-ingest-"));
    const auth = createHookSessionAuth();
    const received = [];
    const server = createHookIngestServer({
      auth,
      runtimeDirectory: path.join(directory, "runtime"),
      onEnvelope: async (envelope) => {
        received.push(envelope);
        return true;
      },
    });
    cleanups.push(async () => {
      await server.dispose();
      await rm(directory, { recursive: true, force: true });
    });
    const endpoint = await server.start();
    const token = auth.issue({ terminalSessionId: "terminal-1", providerId: "*" });
    const envelope = hookEnvelope({ token });
    await sendFrame(endpoint, `${JSON.stringify(envelope)}\n`);
    await waitFor(() => received.length === 1);
    expect(received[0]).toMatchObject({ providerId: "codex", terminalSessionId: "terminal-1" });
    expect(await server.processFrame(JSON.stringify(hookEnvelope({ token: "x".repeat(43) })))).toBe(false);
    expect(received).toHaveLength(1);
    if (process.platform !== "win32") {
      expect((await stat(endpoint)).mode & 0o777).toBe(0o600);
    }
  });
});

function hookEnvelope({ token }) {
  return {
    schemaVersion: 1,
    terminalSessionId: "terminal-1",
    providerId: "codex",
    token,
    payload: {
      eventName: "PreToolUse",
      sessionId: "session-1",
      turnId: "turn-1",
      toolCallId: "call-1",
      toolName: "Read",
      cwd: "/workspace",
      input: { file_path: "/workspace/readme.md" },
    },
  };
}

function sendFrame(endpoint, frame) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    socket.once("error", reject);
    socket.once("connect", () => socket.end(frame));
    socket.once("close", resolve);
  });
}

async function waitFor(predicate) {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for local ingest.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

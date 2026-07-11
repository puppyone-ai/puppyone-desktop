import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentPersistenceLimits, createAgentPersistence } from "../electron/main/agent/agent-persistence.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.promises.rm(directory, { recursive: true, force: true })
  )));
});

describe("Desktop Agent persistence", () => {
  it("omits raw command deltas and redacts retained preview secrets", async () => {
    const userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-persistence-"));
    temporaryDirectories.push(userData);
    const persistence = createAgentPersistence({
      app: { getPath: () => userData },
      logger: { warn: () => {} },
    });

    await persistence.save({
      sessionId: "session-1",
      workspaceRoot: "/workspace",
      runtimeId: "codex",
      providerSessionId: "thread-1",
      title: "Session",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      terminalState: "completed",
      selectedModel: "gpt-5",
      lastSequence: 3,
      events: [
        event(1, "command.output.delta", { delta: "AWS_SECRET_ACCESS_KEY=raw-secret" }),
        event(2, "tool.completed", { outputPreview: "CLIENT_SECRET=retained-secret" }),
        event(3, "usage.updated", { total: { inputTokens: 12, outputTokens: 4 } }),
      ],
    });

    const [record] = await persistence.readAll();
    expect(record.events.map((entry) => entry.type)).toEqual(["tool.completed", "usage.updated"]);
    expect(JSON.stringify(record)).not.toContain("raw-secret");
    expect(JSON.stringify(record)).not.toContain("retained-secret");
    expect(record.events[1].payload.total).toEqual({ inputTokens: 12, outputTokens: 4 });
  });

  it("does not parse an unexpectedly large journal", async () => {
    const userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-persistence-"));
    temporaryDirectories.push(userData);
    const filePath = path.join(userData, "desktop-agent-sessions.json");
    await fs.promises.writeFile(filePath, "{}");
    await fs.promises.truncate(filePath, agentPersistenceLimits.maxJournalBytes + 1);
    const warn = vi.fn();
    const persistence = createAgentPersistence({
      app: { getPath: () => userData },
      logger: { warn },
    });

    await expect(persistence.readAll()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/safety limit/i));
  });

  it("migrates a v1 Codex-only journal at the persistence boundary", async () => {
    const userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-persistence-"));
    temporaryDirectories.push(userData);
    await fs.promises.writeFile(path.join(userData, "desktop-agent-sessions.json"), JSON.stringify({
      version: 1,
      sessions: [{
        sessionId: "legacy-session",
        workspaceRoot: "/workspace",
        providerSessionId: "legacy-thread",
        title: "Legacy session",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
        lastSequence: 0,
        events: [],
      }],
    }));
    const persistence = createAgentPersistence({ app: { getPath: () => userData }, logger: { warn: () => {} } });

    const [record] = await persistence.readAll();
    expect(record).toMatchObject({
      runtimeId: "codex",
      provider: "codex",
      runtime: { id: "codex", displayName: "Codex CLI", kind: "direct-cli" },
    });
  });

  it("lists multiple runtime-neutral sessions and supports archive/delete without deleting New Chat history", async () => {
    const userData = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-persistence-"));
    temporaryDirectories.push(userData);
    const persistence = createAgentPersistence({ app: { getPath: () => userData }, logger: { warn: () => {} } });
    for (const [sessionId, runtimeId, second] of [["session-1", "codex", 1], ["session-2", "opencode", 2]]) {
      await persistence.save({
        sessionId,
        workspaceRoot: "/workspace",
        runtimeId,
        providerSessionId: `native-${sessionId}`,
        title: sessionId,
        createdAt: `2026-01-01T00:00:0${second}.000Z`,
        updatedAt: `2026-01-01T00:00:0${second}.000Z`,
        lastSequence: 0,
        events: [],
      });
    }
    expect((await persistence.list("/workspace")).map((entry) => entry.sessionId)).toEqual(["session-2", "session-1"]);
    await persistence.archive("session-2", "2026-01-01T00:00:03.000Z");
    expect((await persistence.list("/workspace")).map((entry) => entry.sessionId)).toEqual(["session-1"]);
    expect((await persistence.list("/workspace", { includeArchived: true })).map((entry) => entry.sessionId)).toContain("session-2");
    await persistence.remove("session-1");
    await expect(persistence.findById("session-1", "/workspace")).resolves.toBeNull();
  });
});

function event(sequence, type, payload) {
  return {
    schemaVersion: 1,
    sequence,
    sessionId: "session-1",
    provider: "codex",
    providerSessionId: "thread-1",
    turnId: "turn-1",
    itemId: null,
    emittedAt: new Date(sequence * 1000).toISOString(),
    type,
    payload,
  };
}

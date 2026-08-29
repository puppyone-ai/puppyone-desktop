import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAgentConversationCatalog,
} from "../electron/main/agent/persistence/agent-conversation-catalog.mjs";

const temporaryDirectories = [];

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => (
  fs.promises.rm(directory, { recursive: true, force: true })
))));

describe("Agent conversation catalog", () => {
  it("persists only bounded routing metadata and native session pointers across restarts", async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-catalog-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "catalog.json");
    const first = createAgentConversationCatalog({ filePath });
    await first.save({
      sessionId: "product-session",
      workspaceRoot: "/workspace",
      runtimeId: "codex",
      runtime: { id: "codex", displayName: "Codex" },
      providerSessionId: "native-thread",
      title: "Fix tests",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      selectedProviderId: "openai",
      selectedModel: "gpt-5.6",
      selectedVariant: "fast",
      selectedEffort: "high",
      selectedMode: "build",
      capabilityRevision: "codex-app-server:1",
      events: [{ type: "assistant.completed", payload: { text: "private transcript" } }],
      secret: "sk-not-allowed",
    });

    const raw = await fs.promises.readFile(filePath, "utf8");
    expect(raw).not.toContain("private transcript");
    expect(raw).not.toContain("sk-not-allowed");
    const restarted = createAgentConversationCatalog({ filePath });
    await expect(restarted.findLatest("/workspace", "codex")).resolves.toMatchObject({
      sessionId: "product-session",
      providerSessionId: "native-thread",
      selectedProviderId: "openai",
      selectedModel: "gpt-5.6",
      selectedVariant: "fast",
      selectedEffort: "high",
      capabilityRevision: "codex-app-server:1",
    });
    await expect(restarted.list("/workspace")).resolves.toHaveLength(1);
  });
});

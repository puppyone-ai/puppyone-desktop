import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Desktop Agent preload boundary", () => {
  it("exposes only explicit Agent operations and one normalized event subscription", async () => {
    const source = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
    for (const name of [
      "discoverAgentProvider",
      "createAgentSession",
      "restoreAgentSession",
      "replayAgentSession",
      "closeAgentSession",
      "startAgentTurn",
      "interruptAgentTurn",
      "resolveAgentApproval",
      "onAgentEvent",
    ]) {
      expect(source).toContain(`${name}:`);
    }
    expect(source).not.toMatch(/spawnAgentProcess|writeAgentStdin|agentEnvironment/);
  });
});

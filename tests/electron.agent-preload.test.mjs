import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Desktop Agent preload boundary", () => {
  it("exposes only the README bridge list and one normalized event subscription", async () => {
    const source = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
    for (const name of [
      "discoverAgentProviders",
      "discoverLocalAgentConnections",
      "listAgentModels",
      "readAgentAccount",
      "createAgentSession",
      "resumeAgentSession",
      "replayAgentSession",
      "listAgentSessions",
      "forkAgentSession",
      "archiveAgentSession",
      "deleteAgentSession",
      "closeAgentSession",
      "startAgentTurn",
      "steerAgentTurn",
      "interruptAgentTurn",
      "compactAgentSession",
      "resolveAgentApproval",
      "resolveAgentQuestion",
      "onAgentEvent",
      "onAgentSessionExit",
    ]) {
      expect(source).toContain(`${name}:`);
    }
    for (const channel of [
      "agent:providers-discover",
      "agent:local-connections-discover",
      "agent:models-list",
      "agent:account-read",
      "agent:session-create",
      "agent:session-resume",
      "agent:session-replay",
      "agent:sessions-list",
      "agent:session-fork",
      "agent:session-archive",
      "agent:session-delete",
      "agent:session-close",
      "agent:turn-start",
      "agent:turn-steer",
      "agent:turn-interrupt",
      "agent:session-compact",
      "agent:approval-resolve",
      "agent:question-resolve",
      "agent:event",
      "agent:session-exit",
    ]) {
      expect(source).toContain(channel);
    }
    // Old README-divergent channel/method names must not linger.
    expect(source).not.toContain("discoverAgentProvider:");
    expect(source).not.toContain("restoreAgentSession:");
    expect(source).not.toContain("agent:provider-discover");
    expect(source).not.toContain("agent:session-restore");
    expect(source).not.toMatch(/spawnAgentProcess|writeAgentStdin|agentEnvironment/);
  });
});

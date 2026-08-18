import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createOwnedJsonHookConfig } from "../electron/main/terminal-agent/activity/registration/owned-config-mutation.mjs";
import { createBridgeCommand } from "../electron/main/terminal-agent/activity/registration/bridge-installer.mjs";

const directories = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("owned Agent activity Hook registration", () => {
  it("merges and removes only Puppyone-owned Codex handlers", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "hooks.json");
    await writeFile(configPath, JSON.stringify({
      description: "user config",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "user-hook" }] }],
      },
    }));
    const registration = createOwnedJsonHookConfig({
      configPath,
      providerId: "codex",
      command: "puppyone-agent-hook.mjs",
    });
    await expect(registration.inspect()).resolves.toMatchObject({ enrollment: "not-configured" });
    await expect(registration.enable()).resolves.toMatchObject({ enrollment: "enabled" });
    const enabled = JSON.parse(await readFile(configPath, "utf8"));
    expect(enabled.description).toBe("user config");
    expect(JSON.stringify(enabled)).toContain("user-hook");
    expect(JSON.stringify(enabled).match(/puppyone-agent-hook\.mjs/gu)).toHaveLength(3);
    await registration.enable();
    expect((await readFile(configPath, "utf8")).match(/puppyone-agent-hook\.mjs/gu)).toHaveLength(3);
    await expect(registration.disable()).resolves.toMatchObject({ enrollment: "not-configured" });
    expect(await readFile(configPath, "utf8")).toContain("user-hook");
  });

  it("preserves a user-edited owned entry and reports repair", async () => {
    const directory = await temporaryDirectory();
    const configPath = path.join(directory, "settings.json");
    await writeFile(configPath, JSON.stringify({
      hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "old/puppyone-agent-hook.mjs" }] }] },
    }));
    const registration = createOwnedJsonHookConfig({
      configPath,
      providerId: "claude",
      command: "new/puppyone-agent-hook.mjs",
    });
    await expect(registration.inspect()).resolves.toMatchObject({ enrollment: "needs-repair" });
    await expect(registration.enable()).rejects.toThrow("AGENT_ACTIVITY_CONFIG_CONFLICT");
    expect(await readFile(configPath, "utf8")).toContain("old/puppyone-agent-hook.mjs");
  });

  it("creates an Electron-as-Node bridge command without shell interpolation", () => {
    expect(createBridgeCommand({
      bridgePath: "/tmp/Puppy One/puppyone-agent-hook.mjs",
      executablePath: "/Applications/Puppy One.app/Contents/MacOS/Puppy One",
      platform: "darwin",
    })).toBe("/usr/bin/env ELECTRON_RUN_AS_NODE=1 '/Applications/Puppy One.app/Contents/MacOS/Puppy One' '/tmp/Puppy One/puppyone-agent-hook.mjs'");
  });
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "puppyone-hook-registration-"));
  directories.push(directory);
  return directory;
}

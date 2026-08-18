import { describe, expect, it } from "vitest";
import {
  extractPatchPaths,
  projectAgentHookPayload,
} from "../electron/main/terminal-agent/activity/bridge/payload-projector.mjs";
import { createTerminalAgentActivityAdapterRegistry } from "../electron/main/terminal-agent/activity/terminal-agent-activity-adapter-registry.mjs";
import { createTerminalAgentActivityHost } from "../electron/main/terminal-agent/activity/terminal-agent-activity-host.mjs";

describe("Terminal Agent activity bridge projection", () => {
  it("extracts patch paths without forwarding patch bodies or file content", () => {
    const payload = projectAgentHookPayload({
      hook_event_name: "PreToolUse",
      session_id: "session-1",
      turn_id: "turn-1",
      tool_name: "apply_patch",
      tool_use_id: "call-1",
      cwd: "/workspace",
      tool_input: {
        command: "*** Begin Patch\n*** Update File: src/app.ts\n@@\n-SECRET\n+NEW SECRET\n*** End Patch",
        content: "ANOTHER_SECRET",
      },
    });
    expect(payload.input).toEqual({ paths: ["src/app.ts"] });
    expect(JSON.stringify(payload)).not.toContain("SECRET");
    expect(extractPatchPaths("*** Delete File: old.txt\n*** Add File: new.txt"))
      .toEqual(["old.txt", "new.txt"]);
  });

  it("keeps only structured path fields for write tools", () => {
    const payload = projectAgentHookPayload({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_use_id: "call-2",
      cwd: "/workspace",
      tool_input: { file_path: "/workspace/a.md", content: "private" },
    });
    expect(payload.input).toEqual({ file_path: "/workspace/a.md" });
  });
});

describe("Terminal Agent activity adapter registry", () => {
  const cases = [
    ["codex", "PreToolUse", "Read", "file.read"],
    ["claude", "PreToolUse", "Edit", "file.write"],
    ["cursor", "preToolUse", "read_file", "file.read"],
    ["opencode", "tool.execute.before", "write_file", "file.write"],
    ["pi", "tool_call", "grep", "file.search"],
    ["hermes", "pre_tool_call", "write_file", "file.write"],
  ];

  it.each(cases)("normalizes %s lifecycle events", (providerId, eventName, toolName, operation) => {
    const adapter = createTerminalAgentActivityAdapterRegistry().get(providerId);
    const event = adapter.normalize(projectedPayload({ eventName, toolName }), {
      terminalSessionId: "terminal-1",
      occurredAt: 42,
    });
    expect(event).toMatchObject({
      providerId,
      phase: "started",
      operation,
      terminalSessionId: "terminal-1",
      targets: [{ path: "src/a.ts", confidence: "exact" }],
    });
  });

  it("keeps shell commands target-free", () => {
    const adapter = createTerminalAgentActivityAdapterRegistry().get("codex");
    const event = adapter.normalize(projectedPayload({ eventName: "PreToolUse", toolName: "Bash" }), {
      terminalSessionId: "terminal-1",
      occurredAt: 42,
    });
    expect(event).toMatchObject({ operation: "command", targets: [] });
  });
});

describe("Terminal Agent activity session preparation", () => {
  it("instruments a regular shell for manually started enrolled Agents", async () => {
    const prepared = [];
    const activityHost = {
      prepareTerminalSession: async (session) => {
        prepared.push(session);
        return { endpoint: "/tmp/activity.sock", token: "token" };
      },
      closeTerminalSession: () => undefined,
      closeSourceSession: () => undefined,
      ingest: () => true,
    };
    const host = createTerminalAgentActivityHost({
      activityHost,
      adapterRegistry: createTerminalAgentActivityAdapterRegistry(),
      registrationService: {
        hasAnyEnabled: async () => true,
        isEnabled: async () => true,
        getSnapshot: async () => ({ schemaVersion: 1, providers: [] }),
        setEnabled: async () => ({ enrollment: "enabled" }),
      },
    });
    const result = await host.prepareTerminalSession({
      terminalSessionId: "terminal-shell",
      providerId: "shell",
      workspaceRoot: "/workspace",
      webContentsId: 3,
    });
    expect(prepared[0]).toMatchObject({ providerId: "*", terminalSessionId: "terminal-shell" });
    expect(result.environment).toMatchObject({
      PUPPYONE_AGENT_ACTIVITY_ENDPOINT: "/tmp/activity.sock",
      PUPPYONE_AGENT_ACTIVITY_TERMINAL_SESSION_ID: "terminal-shell",
    });
    expect(result.environment).not.toHaveProperty("PUPPYONE_AGENT_ACTIVITY_PROVIDER");
  });
});

function projectedPayload({ eventName, toolName }) {
  return {
    eventName,
    sessionId: "session-1",
    turnId: "turn-1",
    toolCallId: "call-1",
    toolName,
    cwd: "/workspace",
    input: { file_path: "src/a.ts" },
  };
}

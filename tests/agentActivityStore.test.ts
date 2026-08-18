import { describe, expect, it, vi } from "vitest";
import type { AgentActivityClient } from "../src/features/desktop-agent-presence/application/agentActivityClient";
import { AgentActivityStore } from "../src/features/desktop-agent-presence/application/agentActivityStore";
import type { AgentActivityEvent } from "../shared/agent-activity-contract/types";

describe("AgentActivityStore", () => {
  it("uses one native subscription and updates only affected path listeners", async () => {
    let nativeListener: ((event: AgentActivityEvent) => void) | null = null;
    const client: AgentActivityClient = {
      subscribe: vi.fn(async () => ({ schemaVersion: 1, activities: [] })),
      onEvent: vi.fn((listener) => {
        nativeListener = listener;
        return () => undefined;
      }),
      unsubscribe: vi.fn(),
    };
    const store = new AgentActivityStore(client);
    const appListener = vi.fn();
    const otherListener = vi.fn();
    store.subscribePath("src/App.tsx", appListener);
    store.subscribePath("src/Other.tsx", otherListener);
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    nativeListener?.(event({ path: "src/App.tsx", operation: "file.read" }));
    expect(appListener).toHaveBeenCalledTimes(1);
    expect(otherListener).not.toHaveBeenCalled();
    expect(store.getPathSnapshot("src/App.tsx")?.primary).toMatchObject({
      providerLabel: "Codex",
      kind: "reading",
    });
    store.dispose();
  });

  it("prioritizes writes over reads and removes cancelled claims", () => {
    const client: AgentActivityClient = {
      subscribe: async () => ({ schemaVersion: 1, activities: [] }),
      onEvent: () => () => undefined,
      unsubscribe: () => undefined,
    };
    const store = new AgentActivityStore(client);
    store.apply(event({ activityId: "read", operation: "file.read" }));
    store.apply(event({ activityId: "write", providerId: "claude", operation: "file.write" }));
    expect(store.getPathSnapshot("src/App.tsx")?.primary).toMatchObject({
      providerLabel: "Claude Code",
      kind: "writing",
    });
    store.apply(event({ activityId: "write", providerId: "claude", operation: "file.write", phase: "cancelled" }));
    expect(store.getPathSnapshot("src/App.tsx")?.primary.kind).toBe("reading");
    store.dispose();
  });
});

function event(overrides: Partial<AgentActivityEvent> & { path?: string } = {}): AgentActivityEvent {
  return {
    schemaVersion: 1,
    eventId: "event-1",
    activityId: overrides.activityId ?? "activity-1",
    providerId: overrides.providerId ?? "codex",
    terminalSessionId: "terminal-1",
    phase: overrides.phase ?? "started",
    operation: overrides.operation ?? "file.read",
    targets: [{
      workspaceRelativePath: overrides.path ?? "src/App.tsx",
      access: overrides.operation === "file.write" ? "write" : "read",
      confidence: "exact",
    }],
    occurredAt: 1,
  };
}

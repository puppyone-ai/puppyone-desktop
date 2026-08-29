import { describe, expect, it } from "vitest";
import {
  createAgentRoutingPreferences,
  parseAgentRoutingPreferences,
  updateAgentRoutePreference,
} from "../src/features/app-shell/agentRoutingPreferences";

describe("Agent routing preferences", () => {
  it("keeps Provider, Model, Variant, Effort and Mode scoped to one Agent runtime", () => {
    const initial = createAgentRoutingPreferences({
      selectedRuntimeId: "puppyone-agent",
      routes: {
        "puppyone-agent": { providerId: "openai", modelId: "openai/gpt-5", variant: "fast", mode: "build" },
        codex: { modelId: "gpt-5.6", effort: "high" },
      },
    });

    const updated = updateAgentRoutePreference(initial, "codex", { modelId: "gpt-5.6-terra", effort: "xhigh" });

    expect(updated.routes["puppyone-agent"]).toEqual(initial.routes["puppyone-agent"]);
    expect(updated.routes.codex).toMatchObject({ modelId: "gpt-5.6-terra", effort: "xhigh" });
    expect(updated.selectedRuntimeId).toBe("puppyone-agent");
  });

  it("migrates legacy global runtime/model values without leaking the model into another runtime", () => {
    const migrated = parseAgentRoutingPreferences(null, {
      legacyRuntimeId: "codex",
      legacyModelId: "gpt-5.6",
    });

    expect(migrated).toEqual({
      version: 1,
      selectedRuntimeId: "codex",
      routes: { codex: { modelId: "gpt-5.6" } },
    });
    expect(parseAgentRoutingPreferences(JSON.stringify({ version: 1, selectedRuntimeId: "claude", routes: {
      claude: { modelId: "claude-sonnet" },
      codex: { modelId: "gpt-5.6" },
    } }))).toMatchObject({
      selectedRuntimeId: "claude",
      routes: {
        claude: { modelId: "claude-sonnet" },
        codex: { modelId: "gpt-5.6" },
      },
    });
  });
});

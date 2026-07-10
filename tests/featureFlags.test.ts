import { describe, expect, it } from "vitest";
import { resolveFeatureFlags } from "../src/features/flags";

describe("feature flag release gates", () => {
  it("keeps the Asset Library homepage unavailable unless a build opts in", () => {
    expect(resolveFeatureFlags({}).assetLibraryHome).toBe(false);
    expect(resolveFeatureFlags({ assetLibraryHome: true }).assetLibraryHome).toBe(true);
  });

  it("keeps Desktop Agent Chat unavailable unless a build opts in", () => {
    expect(resolveFeatureFlags({}).desktopAgentChat).toBe(false);
    expect(resolveFeatureFlags({ desktopAgentChat: true }).desktopAgentChat).toBe(true);
  });
});

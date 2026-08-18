import { describe, expect, it } from "vitest";
import { workspaceContentChangeMatchesPath } from "@puppyone/shared-ui";

describe("editor pane resource invalidation", () => {
  it("refreshes only the changed open resource", () => {
    const event = { sequence: 4, paths: ["notes/today.md"] };
    expect(workspaceContentChangeMatchesPath(event, "notes/today.md")).toBe(true);
    expect(workspaceContentChangeMatchesPath(event, "notes/other.md")).toBe(false);
  });

  it("normalizes separators and reserves null for a real bulk refresh", () => {
    expect(workspaceContentChangeMatchesPath({ sequence: 5, paths: ["notes\\today.md"] }, "notes/today.md"))
      .toBe(true);
    expect(workspaceContentChangeMatchesPath({ sequence: 6, paths: null }, "notes/other.md")).toBe(true);
    expect(workspaceContentChangeMatchesPath(
      { sequence: 7, paths: ["notes/first.md", "notes/other.md"] },
      "notes/other.md",
    )).toBe(true);
  });

  it("does not refresh for an empty or unrelated path batch", () => {
    expect(workspaceContentChangeMatchesPath({ sequence: 8, paths: [] }, "notes/today.md")).toBe(false);
    expect(workspaceContentChangeMatchesPath(
      { sequence: 11, paths: ["./notes/other.md"] },
      "notes/today.md",
    ))
      .toBe(false);
  });

  it("accepts normalized dot-relative events", () => {
    expect(workspaceContentChangeMatchesPath(
      { sequence: 12, paths: ["./notes/today.md"] },
      "notes/today.md",
    ))
      .toBe(true);
  });
});

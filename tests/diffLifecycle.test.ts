import { describe, expect, it } from "vitest";
import { isCurrentDiffLoad } from "../src/features/source-control/diff/lifecycle";

describe("format-aware diff stale-result guard", () => {
  it("commits only the current, non-aborted selection", () => {
    const active = new AbortController();
    expect(isCurrentDiffLoad(4, 4, active.signal, "selection:b", "selection:b")).toBe(true);
    expect(isCurrentDiffLoad(5, 4, active.signal, "selection:b", "selection:b")).toBe(false);
    expect(isCurrentDiffLoad(4, 4, active.signal, "selection:a", "selection:b")).toBe(false);
    active.abort();
    expect(isCurrentDiffLoad(4, 4, active.signal, "selection:b", "selection:b")).toBe(false);
  });

  it("commits zero results from a superseded selection", () => {
    const active = new AbortController();
    let committedResults = 0;
    if (isCurrentDiffLoad(2, 1, active.signal, "selection:new", "selection:old")) {
      committedResults += 1;
    }
    expect(committedResults).toBe(0);
  });
});

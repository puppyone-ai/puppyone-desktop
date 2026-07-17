import { describe, expect, it } from "vitest";
import { SessionUiStateStore } from "../src/features/desktop-agent/application/SessionUiStateStore";

describe("SessionUiStateStore", () => {
  it("bounds sessions with least-recently-used eviction", () => {
    const store = new SessionUiStateStore(2, 10);
    store.patch("old", { draft: "old" });
    store.patch("kept", { draft: "kept" });
    store.read("old");
    store.patch("new", { draft: "new" });

    expect(store.read("old").draft).toBe("old");
    expect(store.read("kept").draft).toBe("");
    expect(store.read("new").draft).toBe("new");
  });

  it("retains only the newest bounded measurement entries and returns defensive copies", () => {
    const store = new SessionUiStateStore(2, 2);
    store.patch("session", { measurements: { first: 1, second: 2, third: 3 } });

    const snapshot = store.read("session");
    expect(snapshot.measurements).toEqual({ second: 2, third: 3 });
    snapshot.measurements.third = 99;
    expect(store.read("session").measurements.third).toBe(3);
  });

  it("rejects invalid cache limits", () => {
    expect(() => new SessionUiStateStore(0, 10)).toThrow(/positive integer/i);
    expect(() => new SessionUiStateStore(1, Number.NaN)).toThrow(/positive integer/i);
  });
});

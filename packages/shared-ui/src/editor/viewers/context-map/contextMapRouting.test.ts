import { describe, expect, it } from "vitest";
import { routeStraightRelationships } from "./contextMapRouting";

describe("folder relationship straight-line routing", () => {
  it("connects the facing glyph edges without a gap", () => {
    const [route] = routeStraightRelationships([{
      id: "left:right",
      source: { left: 10, top: 20, width: 20, height: 20 },
      sourceId: "left",
      target: { left: 110, top: 20, width: 20, height: 20 },
      targetId: "right",
    }]);

    expect(route.path).toBe("M 30 30 L 110 30");
  });

  it("uses a single direct segment for diagonal relationships", () => {
    const [route] = routeStraightRelationships([{
      id: "a:b",
      source: { left: 0, top: 0, width: 20, height: 20 },
      sourceId: "a",
      target: { left: 100, top: 80, width: 20, height: 20 },
      targetId: "b",
    }]);

    expect(route.path.match(/ L /g)).toHaveLength(1);
    expect(route.path).not.toContain(" H ");
    expect(route.path).not.toContain(" V ");
  });
});

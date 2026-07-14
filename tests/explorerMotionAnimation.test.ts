import { describe, expect, it } from "vitest";
import {
  createExplorerMotionAnimation,
  EXPLORER_MOTION_DURATION_MS,
  EXPLORER_MOTION_EASING,
  EXPLORER_MOTION_RAMP_FRACTION,
  getExplorerMotionProgress,
} from "../packages/shared-ui/src/data/explorer/explorerMotionAnimation";

describe("Explorer motion animation", () => {
  it("uses a symmetric accelerate-cruise-decelerate speed profile", () => {
    expect(getExplorerMotionProgress(0)).toBe(0);
    expect(getExplorerMotionProgress(0.5)).toBeCloseTo(0.5, 8);
    expect(getExplorerMotionProgress(1)).toBe(1);
    expect(EXPLORER_MOTION_RAMP_FRACTION).toBeGreaterThan(0.15);
    expect(EXPLORER_MOTION_RAMP_FRACTION).toBeLessThan(0.3);

    for (const time of [0.05, 0.15, 0.32, 0.47]) {
      expect(getExplorerMotionProgress(time)).toBeCloseTo(
        1 - getExplorerMotionProgress(1 - time),
        8,
      );
    }

    const earlyDistance = getExplorerMotionProgress(0.1) - getExplorerMotionProgress(0);
    const cruiseDistanceA = getExplorerMotionProgress(0.5) - getExplorerMotionProgress(0.4);
    const cruiseDistanceB = getExplorerMotionProgress(0.6) - getExplorerMotionProgress(0.5);
    const lateDistance = getExplorerMotionProgress(1) - getExplorerMotionProgress(0.9);
    expect(earlyDistance).toBeLessThan(cruiseDistanceA);
    expect(lateDistance).toBeCloseTo(earlyDistance, 8);
    expect(cruiseDistanceA).toBeCloseTo(cruiseDistanceB, 8);
    expect(EXPLORER_MOTION_EASING).toMatch(/^linear\(.+\)$/);
  });

  it("reveals one logical subtree boundary without opacity or scale", () => {
    const enter = createExplorerMotionAnimation({
      instruction: { kind: "enter", reveal: { start: 0.25, end: 0.5 } },
    });
    const exit = createExplorerMotionAnimation({
      exitPhase: { start: 0.5, end: 0.75 },
    });

    expect(enter?.keyframes.map((frame) => frame.offset)).toEqual([0, 0.25, 0.5, 1]);
    expect(exit?.keyframes.map((frame) => frame.offset)).toEqual([0, 0.5, 0.75, 1]);
    expect(enter?.keyframes[0]?.clipPath).toBe("inset(0 0 100% 0)");
    expect(enter?.keyframes.at(-1)?.clipPath).toBe("inset(0 0 0 0)");
    expect(exit?.keyframes[0]?.clipPath).toBe("inset(0 0 0 0)");
    expect(exit?.keyframes.at(-1)?.clipPath).toBe("inset(0 0 100% 0)");
    expect(JSON.stringify([enter?.keyframes, exit?.keyframes])).not.toMatch(
      /opacity|scale|height|top|margin|padding/i,
    );
  });

  it("keeps enter, move and exit synchronized to one fixed timing contract", () => {
    const definitions = [
      createExplorerMotionAnimation({
        instruction: { kind: "enter", reveal: { start: 0, end: 1 } },
      }),
      createExplorerMotionAnimation({
        instruction: { kind: "move", offsetY: -320 },
      }),
      createExplorerMotionAnimation({
        exitPhase: { start: 0, end: 1 },
      }),
    ];

    for (const definition of definitions) {
      expect(definition?.options).toMatchObject({
        duration: EXPLORER_MOTION_DURATION_MS,
        easing: EXPLORER_MOTION_EASING,
        fill: "both",
      });
    }
    expect(definitions[1]?.keyframes).toEqual([
      { transform: "translateY(-320px)" },
      { transform: "translateY(0)" },
    ]);
  });
});

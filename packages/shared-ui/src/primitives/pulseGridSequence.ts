import { useEffect, useState } from "react";

export const PULSE_GRID_POINTS = {
  topLeft: 0,
  topCenter: 1,
  topRight: 2,
  middleLeft: 3,
  center: 4,
  middleRight: 5,
  bottomLeft: 6,
  bottomCenter: 7,
  bottomRight: 8,
} as const;

export type PulseGridPoint = (typeof PULSE_GRID_POINTS)[keyof typeof PULSE_GRID_POINTS];
export type PulseGridPointState = Readonly<{
  point: PulseGridPoint;
  brightness: number;
}>;
export type PulseGridFrameEntry = PulseGridPoint | PulseGridPointState;
export type PulseGridFrame = readonly PulseGridFrameEntry[];
export type PulseGridFrames = readonly PulseGridFrame[];
export type PulseGridPresetId = "ikun" | "ymca" | "siu";

export type PulseGridSpriteCell = "." | "o" | "O";
export type PulseGridSpriteRow = `${PulseGridSpriteCell}${PulseGridSpriteCell}${PulseGridSpriteCell}`;

export type PulseGridPointAppearance = Readonly<{
  brightness: number;
}>;

export const PULSE_GRID_ORBIT_FRAMES: PulseGridFrames = [
  [PULSE_GRID_POINTS.topLeft],
  [PULSE_GRID_POINTS.topCenter],
  [PULSE_GRID_POINTS.topRight],
  [PULSE_GRID_POINTS.middleRight],
  [PULSE_GRID_POINTS.bottomRight],
  [PULSE_GRID_POINTS.bottomCenter],
  [PULSE_GRID_POINTS.bottomLeft],
  [PULSE_GRID_POINTS.middleLeft],
];

export function pulseGridFrame(
  ...rows: readonly [PulseGridSpriteRow, PulseGridSpriteRow, PulseGridSpriteRow]
): PulseGridFrame {
  const frame: PulseGridPointState[] = [];

  rows.forEach((row, rowIndex) => {
    Array.from(row).forEach((cell, columnIndex) => {
      if (cell === ".") return;
      const point = (rowIndex * 3 + columnIndex) as PulseGridPoint;
      if (cell === "o") {
        frame.push({ point, brightness: 0.52 });
      } else {
        frame.push({ point, brightness: 1 });
      }
    });
  });

  return frame;
}

export const PULSE_GRID_IKUN_FRAMES: PulseGridFrames = [
  pulseGridFrame(
    ".oO",
    "oo.",
    "o.o",
  ),
  pulseGridFrame(
    "ooO",
    ".o.",
    ".oo",
  ),
  pulseGridFrame(
    ".o.",
    "ooO",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    "oo.",
    "o.O",
  ),
  pulseGridFrame(
    ".o.",
    "oo.",
    "oOo",
  ),
  pulseGridFrame(
    ".o.",
    ".oo",
    "O.o",
  ),
  pulseGridFrame(
    ".o.",
    "Ooo",
    "o.o",
  ),
  pulseGridFrame(
    "Oo.",
    ".oo",
    "o.o",
  ),
  pulseGridFrame(
    "Ooo",
    ".o.",
    "oo.",
  ),
  pulseGridFrame(
    ".o.",
    "Ooo",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    ".oo",
    "O.o",
  ),
  pulseGridFrame(
    ".o.",
    ".oo",
    "oOo",
  ),
  pulseGridFrame(
    ".o.",
    "oo.",
    "o.O",
  ),
  pulseGridFrame(
    ".o.",
    "ooO",
    "o.o",
  ),
];

export const PULSE_GRID_YMCA_FRAMES: PulseGridFrames = [
  pulseGridFrame(
    "OoO",
    ".o.",
    "o.o",
  ),
  pulseGridFrame(
    "OoO",
    ".o.",
    ".oo",
  ),
  pulseGridFrame(
    ".o.",
    "Ooo",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    "oo.",
    "O.o",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    ".oo",
    "o.O",
  ),
  pulseGridFrame(
    ".o.",
    "ooO",
    "o.o",
  ),
  pulseGridFrame(
    "OoO",
    ".o.",
    "o.o",
  ),
  pulseGridFrame(
    "OoO",
    ".o.",
    "oo.",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    "Ooo",
    ".oo",
  ),
  pulseGridFrame(
    ".o.",
    "ooO",
    "oo.",
  ),
];

export const PULSE_GRID_SIU_FRAMES: PulseGridFrames = [
  pulseGridFrame(
    ".o.",
    "Oo.",
    ".o.",
  ),
  pulseGridFrame(
    ".o.",
    ".oO",
    "o..",
  ),
  pulseGridFrame(
    "..o",
    ".oO",
    "..o",
  ),
  pulseGridFrame(
    ".o.",
    ".oo",
    ".oO",
  ),
  pulseGridFrame(
    "OoO",
    ".o.",
    "...",
  ),
  pulseGridFrame(
    "Ooo",
    "..o",
    ".o.",
  ),
  pulseGridFrame(
    "ooO",
    "o..",
    ".o.",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    ".o.",
  ),
  pulseGridFrame(
    ".o.",
    ".o.",
    "O.O",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    ".oo",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    "o.o",
  ),
  pulseGridFrame(
    ".o.",
    "OoO",
    "o.o",
  ),
];

export const PULSE_GRID_PRESET_IDS = ["ikun", "ymca", "siu"] as const satisfies readonly PulseGridPresetId[];

export const PULSE_GRID_PRESET_FRAMES: Readonly<Record<PulseGridPresetId, PulseGridFrames>> = {
  ikun: PULSE_GRID_IKUN_FRAMES,
  ymca: PULSE_GRID_YMCA_FRAMES,
  siu: PULSE_GRID_SIU_FRAMES,
};

export const DEFAULT_PULSE_GRID_PRESET_ID: PulseGridPresetId = "ikun";
export const PULSE_GRID_DEFAULT_FRAMES = PULSE_GRID_PRESET_FRAMES[DEFAULT_PULSE_GRID_PRESET_ID];

export const DEFAULT_PULSE_GRID_FRAME_DURATION_MS = 110;

type PulseGridPlayback = {
  frames: PulseGridFrames;
  frameIndex: number;
  frame: PulseGridFrame;
};

function sequenceKey(frames: PulseGridFrames): string {
  return frames.map((frame) => frame.map((entry) => (
    typeof entry === "number"
      ? String(entry)
      : `${entry.point}:${entry.brightness}`
  )).join(",")).join(";");
}

function normalizeFrameDuration(frameDurationMs: number): number {
  if (!Number.isFinite(frameDurationMs)) return DEFAULT_PULSE_GRID_FRAME_DURATION_MS;
  return Math.max(16, Math.round(frameDurationMs));
}

export function usePulseGridPlayback(
  frames: PulseGridFrames = PULSE_GRID_DEFAULT_FRAMES,
  frameDurationMs = DEFAULT_PULSE_GRID_FRAME_DURATION_MS,
): PulseGridPlayback {
  const resolvedFrames = frames.length > 0 ? frames : PULSE_GRID_DEFAULT_FRAMES;
  const frameCount = resolvedFrames.length;
  const playbackKey = sequenceKey(resolvedFrames);
  const duration = normalizeFrameDuration(frameDurationMs);
  const [playback, setPlayback] = useState({ key: playbackKey, index: 0 });
  const frameIndex = playback.key === playbackKey ? playback.index % frameCount : 0;

  useEffect(() => {
    if (frameCount < 2) return undefined;

    const interval = window.setInterval(() => {
      setPlayback((current) => {
        const currentIndex = current.key === playbackKey ? current.index : 0;
        return {
          key: playbackKey,
          index: (currentIndex + 1) % frameCount,
        };
      });
    }, duration);

    return () => window.clearInterval(interval);
  }, [duration, frameCount, playbackKey]);

  return {
    frames: resolvedFrames,
    frameIndex,
    frame: resolvedFrames[frameIndex] ?? [],
  };
}

export function getPulseGridPointAppearance(
  frame: PulseGridFrame,
  point: PulseGridPoint,
): PulseGridPointAppearance {
  let brightness = 0;

  frame.forEach((entry) => {
    if (typeof entry === "number") {
      if (entry === point) brightness = 1;
      return;
    }
    if (entry.point !== point) return;
    brightness = Math.max(brightness, Math.min(1, Math.max(0, entry.brightness)));
  });

  return { brightness };
}

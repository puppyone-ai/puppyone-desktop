import { describe, expect, it } from "vitest";
import { terminalDefaultColorsFromTheme } from "../src/features/desktop-terminal/runtime/terminalAppearance";

describe("terminal default-color negotiation", () => {
  it("converts Chromium CSS Color 4 serialization into OSC-ready RGB", () => {
    expect(terminalDefaultColorsFromTheme({
      foreground: "color(srgb 0.819608 0.807843 0.776471)",
      background: "color(srgb 0.0862745 0.0784314 0.0745098)",
    })).toEqual({
      foreground: [209, 206, 198],
      background: [22, 20, 19],
    });
  });

  it("supports modern rgb percentages without changing legacy RGB", () => {
    expect(terminalDefaultColorsFromTheme({
      foreground: "rgb(80% 75% 70%)",
      background: "rgb(23, 24, 28)",
    })).toEqual({
      foreground: [204, 191, 179],
      background: [23, 24, 28],
    });
  });

  it("uses safe defaults only for unsupported color serialization", () => {
    expect(terminalDefaultColorsFromTheme({
      foreground: "not-a-color",
      background: undefined,
    })).toEqual({
      foreground: [47, 42, 35],
      background: [251, 250, 247],
    });
  });
});

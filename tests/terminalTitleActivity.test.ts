import { describe, expect, it } from "vitest";
import { readTerminalActivitySpinnerFrame } from "../src/features/desktop-terminal/runtime/terminalTitleActivity";

describe("Terminal title activity", () => {
  it.each(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])(
    "recognizes the Braille spinner frame %s",
    (frame) => {
      expect(readTerminalActivitySpinnerFrame(`${frame} puppyone`)).toBe(frame);
    },
  );

  it("does not treat idle or ordinary titles as active", () => {
    expect(readTerminalActivitySpinnerFrame("✳ puppyone")).toBeNull();
    expect(readTerminalActivitySpinnerFrame("puppyone")).toBeNull();
    expect(readTerminalActivitySpinnerFrame("")).toBeNull();
  });
});

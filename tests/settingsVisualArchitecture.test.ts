import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("settings visual architecture", () => {
  it("keeps hover feedback on interactive controls rather than layout rows", () => {
    const settings = source("src/styles/settings.css");
    const controls = source("src/styles/settings-controls.css");

    expect(settings).not.toContain(".desktop-settings-row:hover");
    expect(settings).not.toContain(".desktop-puppyone-config-row:hover");
    expect(settings).toContain(".desktop-settings-row-action:hover:not(:disabled)");
    expect(controls).toContain(".desktop-theme-segment button:hover");
    expect(controls).toContain(".desktop-theme-choice:hover");
  });
});

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

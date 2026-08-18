/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  applyTypographyToElement,
  resolveTypography,
} from "../src/features/typography";

describe("typography runtime boundary", () => {
  it("applies trusted primaries and categories without overriding product fallbacks", () => {
    const element = document.createElement("div");
    element.style.setProperty("--po-font-content", '"Legacy full stack"');
    const resolved = resolveTypography(DEFAULT_TYPOGRAPHY_PREFERENCES);

    applyTypographyToElement(element, resolved);

    expect(element.dataset.fontUiCategory).toBe("sans");
    expect(element.dataset.fontContentCategory).toBe("sans");
    expect(element.dataset.fontCodeCategory).toBe("monospace");
    expect(element.dataset.fontTerminalCategory).toBe("monospace");
    expect(element.style.getPropertyValue("--po-font-content")).toBe("");
    expect(element.style.getPropertyValue("--po-font-content-primary")).toBe('"Geist Sans"');
    expect(element.style.getPropertyValue("--po-font-code-primary")).toBe('"Geist Mono"');
  });
});

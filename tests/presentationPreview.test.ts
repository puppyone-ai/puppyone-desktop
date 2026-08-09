import { describe, expect, it } from "vitest";
import { getPresentationNavigationTarget } from "../packages/shared-ui/src/editor/viewers/presentationPreview";

describe("PowerPoint preview navigation", () => {
  it("supports familiar arrow, paging, and boundary keys", () => {
    const target = (key: string, activeSlide = 2, slideCount = 5) => (
      getPresentationNavigationTarget({ key, activeSlide, slideCount })
    );

    expect(target("ArrowLeft")).toBe(1);
    expect(target("ArrowUp")).toBe(1);
    expect(target("PageUp")).toBe(1);
    expect(target("ArrowRight")).toBe(3);
    expect(target("ArrowDown")).toBe(3);
    expect(target("PageDown")).toBe(3);
    expect(target("Home")).toBe(0);
    expect(target("End")).toBe(4);
    expect(target("Enter")).toBeNull();
  });

  it("clamps navigation at the first and last slide", () => {
    expect(getPresentationNavigationTarget({ key: "ArrowLeft", activeSlide: 0, slideCount: 3 })).toBe(0);
    expect(getPresentationNavigationTarget({ key: "ArrowRight", activeSlide: 2, slideCount: 3 })).toBe(2);
    expect(getPresentationNavigationTarget({ key: "Home", activeSlide: 0, slideCount: 0 })).toBeNull();
  });
});

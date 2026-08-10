import { describe, expect, it } from "vitest";
import {
  getPresentationFitZoomPercent,
  getPresentationNavigationTarget,
  settlePresentationFonts,
} from "../packages/shared-ui/src/editor/viewers/presentationPreview";

describe("PowerPoint preview fitting", () => {
  it("uses the tighter of the available width and height", () => {
    expect(getPresentationFitZoomPercent({
      availableWidth: 1_200,
      availableHeight: 300,
      slideWidth: 960,
      slideHeight: 540,
    })).toBe(55.55);
    expect(getPresentationFitZoomPercent({
      availableWidth: 480,
      availableHeight: 1_000,
      slideWidth: 960,
      slideHeight: 540,
    })).toBe(50);
  });

  it("rejects unavailable geometry and respects renderer zoom bounds", () => {
    expect(getPresentationFitZoomPercent({
      availableWidth: 0,
      availableHeight: 300,
      slideWidth: 960,
      slideHeight: 540,
    })).toBeNull();
    expect(getPresentationFitZoomPercent({
      availableWidth: 20,
      availableHeight: 20,
      slideWidth: 960,
      slideHeight: 540,
    })).toBe(10);
  });
});

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

describe("PowerPoint preview font settling", () => {
  it("waits for available fonts without holding the preview forever", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    await settlePresentationFonts(new Promise(() => undefined), controller.signal, 5);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });

  it("honors preview cancellation while fonts are settling", async () => {
    const controller = new AbortController();
    const result = settlePresentationFonts(new Promise(() => undefined), controller.signal, 1_000);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});

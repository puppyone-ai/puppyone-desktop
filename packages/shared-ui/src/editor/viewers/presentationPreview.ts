export function getPresentationNavigationTarget({
  key,
  activeSlide,
  slideCount,
}: {
  key: string;
  activeSlide: number;
  slideCount: number;
}): number | null {
  if (slideCount <= 0) return null;

  switch (key) {
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
      return Math.max(0, activeSlide - 1);
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
      return Math.min(slideCount - 1, activeSlide + 1);
    case "Home":
      return 0;
    case "End":
      return slideCount - 1;
    default:
      return null;
  }
}

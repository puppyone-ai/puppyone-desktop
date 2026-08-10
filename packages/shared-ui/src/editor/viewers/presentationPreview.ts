export const PRESENTATION_FONT_SETTLE_TIMEOUT_MS = 1_500;

export function getPresentationFitZoomPercent({
  availableWidth,
  availableHeight,
  slideWidth,
  slideHeight,
}: {
  availableWidth: number;
  availableHeight: number;
  slideWidth: number;
  slideHeight: number;
}): number | null {
  if (
    !Number.isFinite(availableWidth)
    || !Number.isFinite(availableHeight)
    || !Number.isFinite(slideWidth)
    || !Number.isFinite(slideHeight)
    || availableWidth <= 0
    || availableHeight <= 0
    || slideWidth <= 0
    || slideHeight <= 0
  ) {
    return null;
  }

  const scale = Math.min(availableWidth / slideWidth, availableHeight / slideHeight);
  // The renderer accepts zoom percentages from 10–400. Round down so a
  // fractional device pixel never creates a clipped edge in a tight viewport.
  return Math.max(10, Math.min(400, Math.floor(scale * 10_000) / 100));
}

export async function settlePresentationFonts(
  fontsReady: PromiseLike<unknown> | undefined,
  signal: AbortSignal,
  timeoutMs = PRESENTATION_FONT_SETTLE_TIMEOUT_MS,
): Promise<void> {
  signal.throwIfAborted();
  if (!fontsReady) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      resolve();
    };

    timeoutId = setTimeout(finish, Math.max(0, timeoutMs));
    signal.addEventListener("abort", finish, { once: true });
    void Promise.resolve(fontsReady).then(finish, finish);
  });

  signal.throwIfAborted();
}

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

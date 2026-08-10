export const PRESENTATION_FONT_SETTLE_TIMEOUT_MS = 1_500;

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

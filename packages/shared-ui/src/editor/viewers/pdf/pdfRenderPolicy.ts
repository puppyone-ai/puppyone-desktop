export type PdfRenderBudget = Readonly<{
  maxConcurrentRenders: number;
  maxResidentCanvases: number;
  maxCanvasPixels: number;
  maxOutputScale: number;
  overscanPixels: number;
}>;

export const PDF_RENDER_BUDGET: PdfRenderBudget = Object.freeze({
  maxConcurrentRenders: 2,
  maxResidentCanvases: 6,
  maxCanvasPixels: 8_388_608,
  maxOutputScale: 2,
  overscanPixels: 800,
});

export const PDF_SAFE_MODE_RENDER_BUDGET: PdfRenderBudget = Object.freeze({
  maxConcurrentRenders: 1,
  maxResidentCanvases: 3,
  maxCanvasPixels: 5_592_405,
  maxOutputScale: 1,
  overscanPixels: 320,
});

export function resolvePdfRenderBudget({
  maxCanvasPixels,
  maxActiveCanvases,
}: {
  maxCanvasPixels?: number;
  maxActiveCanvases?: number;
}, safeMode: boolean): PdfRenderBudget {
  const baseline = safeMode ? PDF_SAFE_MODE_RENDER_BUDGET : PDF_RENDER_BUDGET;
  return Object.freeze({
    ...baseline,
    maxCanvasPixels: positiveLimit(maxCanvasPixels, baseline.maxCanvasPixels),
    maxResidentCanvases: positiveLimit(
      maxActiveCanvases,
      baseline.maxResidentCanvases,
    ),
  });
}

export function resolvePdfCanvasMetrics({
  cssWidth,
  cssHeight,
  devicePixelRatio,
  budget,
}: {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  budget: PdfRenderBudget;
}) {
  const normalizedWidth = Math.max(1, cssWidth);
  const normalizedHeight = Math.max(1, cssHeight);
  const pixelScaleLimit = Math.sqrt(
    budget.maxCanvasPixels / (normalizedWidth * normalizedHeight),
  );
  const outputScale = Math.max(0.1, Math.min(
    Math.max(1, devicePixelRatio || 1),
    budget.maxOutputScale,
    pixelScaleLimit,
  ));
  const width = Math.max(1, Math.floor(normalizedWidth * outputScale));
  const height = Math.max(1, Math.floor(normalizedHeight * outputScale));
  return Object.freeze({
    width,
    height,
    outputScale,
    pixels: width * height,
  });
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Math.min(value as number, fallback)
    : fallback;
}

export type InlineDirection = "ltr" | "rtl";

export function getPointerResizedSidebarWidth({
  currentX,
  direction,
  startWidth,
  startX,
}: {
  currentX: number;
  direction: InlineDirection;
  startWidth: number;
  startX: number;
}) {
  const directionMultiplier = direction === "rtl" ? -1 : 1;
  return startWidth + (startX - currentX) * directionMultiplier;
}

export function getArrowResizedSidebarWidth({
  currentWidth,
  direction,
  key,
  step,
}: {
  currentWidth: number;
  direction: InlineDirection;
  key: "ArrowLeft" | "ArrowRight";
  step: number;
}) {
  const directionMultiplier = direction === "rtl" ? -1 : 1;
  return key === "ArrowLeft"
    ? currentWidth + step * directionMultiplier
    : currentWidth - step * directionMultiplier;
}

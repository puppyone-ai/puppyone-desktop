export function isCurrentDiffLoad(
  currentLoadId: number,
  completedLoadId: number,
  signal: AbortSignal,
  selectionIdentity: string,
  expectedSelectionIdentity: string = selectionIdentity,
) {
  return (
    !signal.aborted &&
    currentLoadId === completedLoadId &&
    selectionIdentity === expectedSelectionIdentity
  );
}

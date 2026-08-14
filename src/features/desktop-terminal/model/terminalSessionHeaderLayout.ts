export const TERMINAL_SESSION_HEADER_METRICS = Object.freeze({
  gap: 3,
  fullMaximum: 144,
  fullMinimum: 104,
  compact: 28,
  overflowControl: 28,
  createControl: 28,
  absoluteActiveMinimum: 64,
  activationMotionMs: 220,
});

export type TerminalSessionHeaderLayoutMode = "full" | "compact" | "overflow";

export type TerminalSessionHeaderLayout = {
  mode: TerminalSessionHeaderLayoutMode;
  activeTabWidth: number;
  inactiveTabWidth: number;
  visibleSessionIds: readonly string[];
  hiddenSessionIds: readonly string[];
};

type ResolveTerminalSessionHeaderLayoutInput = {
  sessionIds: readonly string[];
  activeSessionId: string | null;
  availableWidth: number;
  preferredVisibleSessionIds?: readonly string[];
};

/**
 * Resolves density from the rail capacity supplied by the Header container.
 * The active session is always visible; overflow retains its nearest siblings
 * in stable session order.
 */
export function resolveTerminalSessionHeaderLayout({
  sessionIds,
  activeSessionId,
  availableWidth,
  preferredVisibleSessionIds = [],
}: ResolveTerminalSessionHeaderLayoutInput): TerminalSessionHeaderLayout {
  const metrics = TERMINAL_SESSION_HEADER_METRICS;
  const count = sessionIds.length;
  if (count === 0) {
    return {
      mode: "full",
      activeTabWidth: metrics.fullMaximum,
      inactiveTabWidth: metrics.fullMaximum,
      visibleSessionIds: [],
      hiddenSessionIds: [],
    };
  }

  const effectiveActiveId = sessionIds.includes(activeSessionId ?? "")
    ? activeSessionId as string
    : sessionIds[0];
  const width = Math.max(0, Math.floor(availableWidth));
  if (width === 0) return allVisible("full", metrics.fullMaximum);

  const fullWidth = Math.floor((width - metrics.gap * (count - 1)) / count);
  if (fullWidth >= metrics.fullMinimum) {
    return allVisible("full", Math.min(metrics.fullMaximum, fullWidth));
  }

  const compactInactiveWidth = (count - 1) * metrics.compact;
  const compactGaps = metrics.gap * (count - 1);
  const compactActiveWidth = width - compactInactiveWidth - compactGaps;
  if (compactActiveWidth >= metrics.fullMinimum) {
    return {
      mode: "compact",
      activeTabWidth: Math.min(metrics.fullMaximum, compactActiveWidth),
      inactiveTabWidth: metrics.compact,
      visibleSessionIds: [...sessionIds],
      hiddenSessionIds: [],
    };
  }

  const availableForCompactTabs = Math.max(
    0,
    width - metrics.fullMinimum - metrics.overflowControl - metrics.gap,
  );
  const visibleInactiveCount = Math.min(
    count - 1,
    Math.floor(availableForCompactTabs / (metrics.compact + metrics.gap)),
  );
  const visibleCount = visibleInactiveCount + 1;
  const visibleSessionIds = canPreserveVisibleWindow({
    activeSessionId: effectiveActiveId,
    preferredVisibleSessionIds,
    sessionIds,
    visibleCount,
  })
    ? [...preferredVisibleSessionIds]
    : nearestSessionWindow(sessionIds, effectiveActiveId, visibleInactiveCount);
  const activeTabWidth = Math.max(
    metrics.absoluteActiveMinimum,
    Math.min(
      metrics.fullMaximum,
      width
        - metrics.overflowControl
        - metrics.gap
        - visibleInactiveCount * (metrics.compact + metrics.gap),
    ),
  );
  const visibleSet = new Set(visibleSessionIds);

  return {
    mode: "overflow",
    activeTabWidth,
    inactiveTabWidth: metrics.compact,
    visibleSessionIds,
    hiddenSessionIds: sessionIds.filter((sessionId) => !visibleSet.has(sessionId)),
  };

  function allVisible(
    mode: TerminalSessionHeaderLayoutMode,
    tabWidth: number,
  ): TerminalSessionHeaderLayout {
    return {
      mode,
      activeTabWidth: tabWidth,
      inactiveTabWidth: tabWidth,
      visibleSessionIds: [...sessionIds],
      hiddenSessionIds: [],
    };
  }
}

/**
 * Preserve the rendered tab window while the user moves between tabs that are
 * already visible. Stable DOM identity lets flex geometry interpolate so the
 * newly active tab pushes its siblings instead of replacing them.
 */
function canPreserveVisibleWindow({
  activeSessionId,
  preferredVisibleSessionIds,
  sessionIds,
  visibleCount,
}: {
  activeSessionId: string;
  preferredVisibleSessionIds: readonly string[];
  sessionIds: readonly string[];
  visibleCount: number;
}) {
  if (
    preferredVisibleSessionIds.length !== visibleCount
    || !preferredVisibleSessionIds.includes(activeSessionId)
  ) return false;

  const sessionIndexById = new Map(sessionIds.map((sessionId, index) => [sessionId, index]));
  let previousIndex = -1;
  for (const sessionId of preferredVisibleSessionIds) {
    const index = sessionIndexById.get(sessionId);
    if (index === undefined || index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
}

function nearestSessionWindow(
  sessionIds: readonly string[],
  activeSessionId: string,
  visibleInactiveCount: number,
) {
  const activeIndex = Math.max(0, sessionIds.indexOf(activeSessionId));
  const nearestIndexes = sessionIds
    .map((_sessionId, index) => index)
    .filter((index) => index !== activeIndex)
    .sort((left, right) => {
      const distance = Math.abs(left - activeIndex) - Math.abs(right - activeIndex);
      return distance || left - right;
    })
    .slice(0, visibleInactiveCount);

  return [activeIndex, ...nearestIndexes]
    .sort((left, right) => left - right)
    .map((index) => sessionIds[index]);
}

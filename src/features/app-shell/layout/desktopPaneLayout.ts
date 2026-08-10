export const DEFAULT_EXPLORER_WIDTH = 320;
export const MIN_EXPLORER_WIDTH = 240;
export const COLLAPSED_EXPLORER_WIDTH = 0;
export const EXPLORER_COLLAPSE_THRESHOLD = 180;

export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 560;
export const MIN_RIGHT_SIDEBAR_WIDTH = 420;
export const RIGHT_SIDEBAR_COLLAPSE_THRESHOLD = 320;

export const MIN_MAIN_PANE_WIDTH = 480;

export type DesktopPaneLayoutInput = Readonly<{
  availableWidth: number;
  explorer: Readonly<{
    collapsed: boolean;
    minWidth?: number;
    preferredWidth: number;
    present: boolean;
  }>;
  mainMinWidth?: number;
  rightSidebar: Readonly<{
    minWidth?: number;
    open: boolean;
    preferredWidth: number;
    present: boolean;
  }>;
}>;

export type ResolvedDesktopPaneLayout = Readonly<{
  availableWidth: number;
  explorer: Readonly<{
    autoCollapsed: boolean;
    collapsed: boolean;
    maxWidth: number;
    minWidth: number;
    width: number;
  }>;
  main: Readonly<{
    minWidth: number;
    width: number;
  }>;
  rightSidebar: Readonly<{
    autoClosed: boolean;
    maxWidth: number;
    minWidth: number;
    open: boolean;
    width: number;
  }>;
  surfaceMinWidth: number;
}>;

/**
 * Resolves the desktop shell as one coordinated three-pane layout.
 *
 * The main pane is the invariant: side panes may shrink or temporarily leave
 * the layout, but the main pane never yields below its minimum while the
 * window itself can still satisfy that minimum.
 */
export function resolveDesktopPaneLayout({
  availableWidth,
  explorer,
  mainMinWidth = MIN_MAIN_PANE_WIDTH,
  rightSidebar,
}: DesktopPaneLayoutInput): ResolvedDesktopPaneLayout {
  const width = normalizeSize(availableWidth);
  const resolvedMainMinWidth = Math.min(normalizeSize(mainMinWidth), width);
  const explorerMinWidth = normalizeMinimum(explorer.minWidth, MIN_EXPLORER_WIDTH);
  const rightSidebarMinWidth = normalizeMinimum(
    rightSidebar.minWidth,
    MIN_RIGHT_SIDEBAR_WIDTH,
  );
  const explorerRequestedOpen = explorer.present && !explorer.collapsed;
  const rightSidebarRequestedOpen = rightSidebar.present && rightSidebar.open;

  const rightSidebarAutoClosed = rightSidebarRequestedOpen
    && width < resolvedMainMinWidth + rightSidebarMinWidth;
  const rightSidebarOpen = rightSidebarRequestedOpen && !rightSidebarAutoClosed;

  const explorerAutoCollapsed = explorerRequestedOpen && (
    width < resolvedMainMinWidth
      + explorerMinWidth
      + (rightSidebarOpen ? rightSidebarMinWidth : 0)
  );
  const explorerCollapsed = !explorerRequestedOpen || explorerAutoCollapsed;

  // Resolve the right pane first during passive window resizing. This makes
  // the navigation pane the first pane to leave on compact windows, while
  // explicit drag operations remain bounded by the current adjacent pane.
  const rightSidebarMaxWidth = Math.max(
    rightSidebarMinWidth,
    width
      - resolvedMainMinWidth
      - (explorerCollapsed ? 0 : explorerMinWidth),
  );
  const rightSidebarWidth = rightSidebarOpen
    ? clamp(
      rightSidebar.preferredWidth,
      rightSidebarMinWidth,
      rightSidebarMaxWidth,
    )
    : 0;

  const explorerMaxWidth = Math.max(
    explorerMinWidth,
    width - resolvedMainMinWidth - rightSidebarWidth,
  );
  const explorerWidth = explorerCollapsed
    ? COLLAPSED_EXPLORER_WIDTH
    : clamp(explorer.preferredWidth, explorerMinWidth, explorerMaxWidth);

  const resolvedRightSidebarMaxWidth = Math.max(
    rightSidebarMinWidth,
    width - resolvedMainMinWidth - explorerWidth,
  );
  const mainWidth = Math.max(0, width - explorerWidth - rightSidebarWidth);

  return {
    availableWidth: width,
    explorer: {
      autoCollapsed: explorerAutoCollapsed,
      collapsed: explorerCollapsed,
      maxWidth: explorerMaxWidth,
      minWidth: explorerMinWidth,
      width: explorerWidth,
    },
    main: {
      minWidth: resolvedMainMinWidth,
      width: mainWidth,
    },
    rightSidebar: {
      autoClosed: rightSidebarAutoClosed,
      maxWidth: resolvedRightSidebarMaxWidth,
      minWidth: rightSidebarMinWidth,
      open: rightSidebarOpen,
      width: rightSidebarWidth,
    },
    surfaceMinWidth: explorerWidth + resolvedMainMinWidth,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(normalizeSize(value), min), max);
}

function normalizeSize(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeMinimum(value: number | undefined, fallback: number) {
  return value === undefined ? fallback : normalizeSize(value);
}

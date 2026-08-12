/**
 * Native desktop window geometry contract.
 *
 * Renderer layout mirrors the minimum width through
 * `--desktop-window-min-width`; the architecture check keeps the two process
 * boundaries synchronized because CSS cannot import an Electron main module.
 */
export const DESKTOP_WINDOW_MIN_WIDTH = 640;

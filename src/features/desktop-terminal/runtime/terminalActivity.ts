import type { DesktopTerminalLauncherId } from "../model/terminalLaunchers";

const OUTPUT_IDLE_MS = 700;
const PRESENTATION_REFRESH_MS = 250;

const brailleSpinnerFrames = new Set([
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
]);

const cursorBusyLabels = [
  "Moving to cloud",
  "Loading conversation",
  "Reconnecting",
  "Running shell command",
  "Planning",
  "Working",
  "Queued",
  "Reviewing changes",
];

type TerminalActivityControllerOptions = {
  launcherId: DesktopTerminalLauncherId;
  onChange: (active: boolean) => void;
  outputIdleMs?: number;
};

/**
 * Normalize product title protocols and generic PTY repaint bursts into one
 * low-frequency activity signal. UI never interprets Agent-specific strings.
 */
export class TerminalActivityController {
  private readonly enabled: boolean;
  private readonly onChange: (active: boolean) => void;
  private readonly outputIdleMs: number;
  private outputIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private presentationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private titleActive = false;
  private outputActive = false;
  private presentationRefreshActive = false;
  private current = false;
  private disposed = false;

  constructor({
    launcherId,
    onChange,
    outputIdleMs = OUTPUT_IDLE_MS,
  }: TerminalActivityControllerOptions) {
    this.enabled = launcherId !== "shell";
    this.onChange = onChange;
    this.outputIdleMs = outputIdleMs;
  }

  get active() {
    return this.current;
  }

  noteTitle(title: string) {
    if (!this.enabled || this.disposed) return;
    this.titleActive = isTerminalTitleActive(title);
    this.publishIfChanged();
  }

  /**
   * Ignore the short PTY repaint caused by a host-owned fit, resize, or focus
   * transition. Upstream title protocols remain authoritative during this
   * window, so real Agent work is never hidden when the CLI exposes it.
   */
  beginPresentationRefresh() {
    if (!this.enabled || this.disposed) return;
    this.presentationRefreshActive = true;
    if (this.presentationRefreshTimer !== null) clearTimeout(this.presentationRefreshTimer);
    this.presentationRefreshTimer = setTimeout(() => {
      this.presentationRefreshTimer = null;
      this.presentationRefreshActive = false;
    }, PRESENTATION_REFRESH_MS);
  }

  noteOutput(data: string) {
    if (!this.enabled || this.disposed || data.length === 0) return;
    if (this.presentationRefreshActive) return;
    this.outputActive = true;
    this.publishIfChanged();
    if (this.outputIdleTimer !== null) clearTimeout(this.outputIdleTimer);
    this.outputIdleTimer = setTimeout(() => {
      this.outputIdleTimer = null;
      this.outputActive = false;
      this.publishIfChanged();
    }, this.outputIdleMs);
  }

  reset() {
    if (this.disposed) return;
    if (this.outputIdleTimer !== null) clearTimeout(this.outputIdleTimer);
    if (this.presentationRefreshTimer !== null) clearTimeout(this.presentationRefreshTimer);
    this.outputIdleTimer = null;
    this.presentationRefreshTimer = null;
    this.presentationRefreshActive = false;
    this.titleActive = false;
    this.outputActive = false;
    this.publishIfChanged();
  }

  dispose() {
    if (this.outputIdleTimer !== null) clearTimeout(this.outputIdleTimer);
    if (this.presentationRefreshTimer !== null) clearTimeout(this.presentationRefreshTimer);
    this.outputIdleTimer = null;
    this.presentationRefreshTimer = null;
    this.presentationRefreshActive = false;
    this.titleActive = false;
    this.outputActive = false;
    this.current = false;
    this.disposed = true;
  }

  private publishIfChanged() {
    const next = this.titleActive || this.outputActive;
    if (next === this.current) return;
    this.current = next;
    this.onChange(next);
  }
}

export function isTerminalTitleActive(title: string) {
  const normalized = title.trim();
  const firstVisibleCharacter = Array.from(normalized)[0];
  if (firstVisibleCharacter && brailleSpinnerFrames.has(firstVisibleCharacter)) return true;

  const statusSeparator = normalized.lastIndexOf(" - ");
  if (statusSeparator < 0) return false;
  const status = normalized.slice(statusSeparator + 3).replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "");
  return cursorBusyLabels.some((label) => status === label || status.startsWith(`${label} `));
}

export const terminalActivityPolicy = Object.freeze({
  outputIdleMs: OUTPUT_IDLE_MS,
  presentationRefreshMs: PRESENTATION_REFRESH_MS,
});

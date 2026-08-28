/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DesktopTelemetryNotice,
  shouldShowDesktopTelemetryNotice,
} from "../src/features/telemetry/DesktopTelemetryNotice";
import type { DesktopTelemetryState } from "../src/types/electron";

vi.mock("@puppyone/localization", () => ({
  useLocalization: () => ({
    t: (id: string) => ({
      "telemetry.notice.title": "Help improve puppyone",
      "telemetry.notice.description": "Anonymous daily activity only.",
      "telemetry.notice.learnMore": "Details",
      "telemetry.notice.showLess": "Less",
      "telemetry.notice.details": "One record per UTC day.",
      "telemetry.notice.notNow": "Later",
      "telemetry.notice.understand": "I understand",
      "telemetry.notice.error": "Try again.",
    }[id] ?? id),
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  window.location.hash = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await act(async () => { await Promise.resolve(); });
  delete window.puppyoneDesktop;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("DesktopTelemetryNotice", () => {
  it("waits for an eligible Stable transport and a required notice", () => {
    expect(shouldShowDesktopTelemetryNotice(null)).toBe(false);
    expect(shouldShowDesktopTelemetryNotice(telemetryState({ transportConfigured: false }))).toBe(false);
    expect(shouldShowDesktopTelemetryNotice(telemetryState({ noticeRequired: false }))).toBe(false);
    expect(shouldShowDesktopTelemetryNotice(telemetryState())).toBe(true);
  });

  it("dismisses Later for the current renderer session without recording consent", async () => {
    const bridge = installTelemetryBridge();
    act(() => root?.render(<DesktopTelemetryNotice />));
    await vi.waitFor(() => expect(container.textContent).toContain("Help improve puppyone"));

    await clickButton("Later");

    expect(container.textContent).not.toContain("Help improve puppyone");
    expect(bridge.markTelemetryNoticeSeen).not.toHaveBeenCalled();
  });

  it("records I understand through the bounded notice IPC and closes the card", async () => {
    const bridge = installTelemetryBridge();
    act(() => root?.render(<DesktopTelemetryNotice />));
    await vi.waitFor(() => expect(container.textContent).toContain("Help improve puppyone"));

    await clickButton("I understand");

    await vi.waitFor(() => expect(bridge.markTelemetryNoticeSeen).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(container.textContent).not.toContain("Help improve puppyone"));
  });

  it("keeps disclosure details in the lightweight card", async () => {
    installTelemetryBridge();
    act(() => root?.render(<DesktopTelemetryNotice />));
    await vi.waitFor(() => expect(container.textContent).toContain("Details"));

    await clickButton("Details");

    expect(container.textContent).toContain("One record per UTC day.");
    expect(container.textContent).toContain("Less");
  });
});

function installTelemetryBridge() {
  const initial = telemetryState();
  const bridge = {
    getTelemetryState: vi.fn().mockResolvedValue(initial),
    markTelemetryNoticeSeen: vi.fn().mockResolvedValue(telemetryState({
      enabled: true,
      disabledReason: null,
      noticeRequired: false,
      noticeSeenVersion: 1,
    })),
    onTelemetryStateChanged: vi.fn(() => vi.fn()),
  };
  Object.defineProperty(window, "puppyoneDesktop", {
    configurable: true,
    value: bridge,
  });
  return bridge;
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeDefined();
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
}

function telemetryState(overrides: Partial<DesktopTelemetryState> = {}): DesktopTelemetryState {
  return {
    schemaVersion: 1,
    defaultLevel: "basic",
    level: "basic",
    effectiveLevel: "off",
    enabled: false,
    eligible: true,
    disabledReason: "notice-required",
    noticeVersion: 1,
    noticeSeenVersion: 0,
    noticeRequired: true,
    transportConfigured: true,
    queuedEventCount: 0,
    ...overrides,
  };
}

/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivacySettingsView } from "../src/features/settings/main/PrivacySettingsView";
import type { DesktopTelemetryState } from "../src/types/electron";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await act(async () => { await Promise.resolve(); });
  delete window.puppyoneDesktop;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Privacy settings", () => {
  it("shows Stable product analytics on by default and persists both choices", async () => {
    const bridge = installTelemetryBridge(telemetryState());
    await renderPrivacySettings();

    const toggle = findToggle();
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(false);
    expect(container.textContent).toContain("Never files or prompts");

    await act(async () => toggle.click());
    expect(bridge.setTelemetryLevel).toHaveBeenLastCalledWith({ level: "off" });
    await vi.waitFor(() => expect(toggle.checked).toBe(false));

    await act(async () => toggle.click());
    expect(bridge.setTelemetryLevel).toHaveBeenLastCalledWith({ level: "basic" });
    await vi.waitFor(() => expect(toggle.checked).toBe(true));
  });

  it("keeps the switch disabled outside eligible Stable releases", async () => {
    installTelemetryBridge(telemetryState({ eligible: false, level: "off" }));
    await renderPrivacySettings();

    const toggle = findToggle();
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
    expect(container.textContent).toContain("available in Stable releases");
  });

  it("surfaces a quiet inline error without changing the saved choice", async () => {
    const bridge = installTelemetryBridge(telemetryState());
    bridge.setTelemetryLevel.mockRejectedValueOnce(new Error("failed"));
    await renderPrivacySettings();

    const toggle = findToggle();
    await act(async () => toggle.click());

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(toggle.checked).toBe(true);
    expect(container.textContent).toContain("could not be updated");
  });

  it("opens the public telemetry disclosure outside the app", async () => {
    const bridge = installTelemetryBridge(telemetryState());
    await renderPrivacySettings();

    const link = container.querySelector<HTMLAnchorElement>(".desktop-privacy-setting-detail a");
    await act(async () => link?.click());

    expect(bridge.openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/puppyone-ai/puppyone-desktop/blob/main/docs/telemetry.md",
    );
  });
});

async function renderPrivacySettings(): Promise<void> {
  await act(async () => {
    root?.render(withTestLocalization(<PrivacySettingsView />));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findToggle(): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[aria-label="Product analytics"]')!;
}

function installTelemetryBridge(initial: DesktopTelemetryState) {
  let current = initial;
  const listeners = new Set<(state: DesktopTelemetryState) => void>();
  const bridge = {
    getTelemetryState: vi.fn(async () => current),
    setTelemetryLevel: vi.fn(async ({ level }: { level: "basic" | "off" }) => {
      current = telemetryState({
        ...current,
        level,
        effectiveLevel: level,
        enabled: level === "basic",
        disabledReason: level === "off" ? "preference-off" : null,
      });
      listeners.forEach((listener) => listener(current));
      return current;
    }),
    onTelemetryStateChanged: vi.fn((listener: (state: DesktopTelemetryState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    openExternalUrl: vi.fn().mockResolvedValue({ ok: true }),
  };
  Object.defineProperty(window, "puppyoneDesktop", {
    configurable: true,
    value: bridge,
  });
  return bridge;
}

function telemetryState(overrides: Partial<DesktopTelemetryState> = {}): DesktopTelemetryState {
  return {
    schemaVersion: 1,
    defaultLevel: "basic",
    level: "basic",
    effectiveLevel: "basic",
    enabled: true,
    eligible: true,
    disabledReason: null,
    noticeVersion: 1,
    noticeSeenVersion: 1,
    noticeRequired: false,
    transportConfigured: true,
    queuedEventCount: 0,
    ...overrides,
  };
}

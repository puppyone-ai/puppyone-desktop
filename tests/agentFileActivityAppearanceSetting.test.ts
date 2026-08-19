/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentFileActivityAppearanceSetting,
  reconcileNativeActivityHooks,
} from "../src/features/desktop-agent-presence/ui/AgentFileActivityAppearanceSetting";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  delete window.puppyoneDesktop;
  vi.restoreAllMocks();
});

describe("Agent file activity Appearance setting", () => {
  it("enrolls only configurable Hooks for locally installed Agents", async () => {
    const setEnrollment = vi.fn(async () => ({ schemaVersion: 1, providers: [] }));
    window.puppyoneDesktop = {
      getAgentActivityEnrollment: vi.fn(async () => enrollment([
        provider("codex", true, "not-configured"),
        provider("claude", true, "not-configured"),
        provider("cursor", true, "not-configured"),
      ])),
      discoverLocalAgentConnections: vi.fn(async () => ({
        connections: [
          localConnection("codex", "detected"),
          localConnection("claude", "not-found"),
          localConnection("cursor-agent", "detected"),
        ],
        scannedAt: new Date(0).toISOString(),
        warnings: [],
      })),
      setAgentActivityEnrollment: setEnrollment,
    } as typeof window.puppyoneDesktop;

    await reconcileNativeActivityHooks({ enabled: true, workspaceRoot: "/workspace" });

    expect(setEnrollment.mock.calls).toEqual([
      [{ providerId: "codex", enabled: true }],
      [{ providerId: "cursor", enabled: true }],
    ]);
  });

  it("removes every configurable Hook when the Appearance switch is disabled", async () => {
    const setEnrollment = vi.fn(async () => ({ schemaVersion: 1, providers: [] }));
    window.puppyoneDesktop = {
      getAgentActivityEnrollment: vi.fn(async () => enrollment([
        provider("codex", true, "enabled"),
        provider("claude", true, "enabled"),
      ])),
      setAgentActivityEnrollment: setEnrollment,
    } as typeof window.puppyoneDesktop;

    await reconcileNativeActivityHooks({ enabled: false, workspaceRoot: "/workspace" });

    expect(setEnrollment.mock.calls).toEqual([
      [{ providerId: "codex", enabled: false }],
      [{ providerId: "claude", enabled: false }],
    ]);
  });

  it("opens one permission step and enables the preference only after Hooks are enrolled", async () => {
    const onChange = vi.fn();
    const setEnrollment = vi.fn(async () => ({ schemaVersion: 1, providers: [] }));
    window.puppyoneDesktop = {
      getAgentActivityEnrollment: vi.fn(async () => enrollment([
        provider("codex", true, "not-configured"),
      ])),
      discoverLocalAgentConnections: vi.fn(async () => ({
        connections: [localConnection("codex", "detected")],
        scannedAt: new Date(0).toISOString(),
        warnings: [],
      })),
      setAgentActivityEnrollment: setEnrollment,
    } as typeof window.puppyoneDesktop;
    renderSetting(onChange);

    act(() => checkbox().click());

    expect(document.querySelector("[role='dialog']")?.textContent).toContain("PuppyOne can access");
    expect(onChange).not.toHaveBeenCalled();
    expect(setEnrollment).not.toHaveBeenCalled();

    await act(async () => {
      primaryButton().click();
      await nextTask();
    });

    expect(setEnrollment).toHaveBeenCalledWith({ providerId: "codex", enabled: true });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(document.querySelector("[role='dialog']")).toBeNull();
  });

  it("keeps the preference unchanged and the permission step open when enrollment fails", async () => {
    const onChange = vi.fn();
    window.puppyoneDesktop = {
      getAgentActivityEnrollment: vi.fn(async () => enrollment([
        provider("codex", true, "not-configured"),
      ])),
      discoverLocalAgentConnections: vi.fn(async () => ({
        connections: [localConnection("codex", "detected")],
        scannedAt: new Date(0).toISOString(),
        warnings: [],
      })),
      setAgentActivityEnrollment: vi.fn(async () => {
        throw new Error("permission denied");
      }),
    } as typeof window.puppyoneDesktop;
    renderSetting(onChange);

    act(() => checkbox().click());
    await act(async () => {
      primaryButton().click();
      await nextTask();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector("[role='dialog']")).not.toBeNull();
    expect(document.querySelector("[role='alert']")?.textContent).toContain("setting wasn't changed");
  });
});

function renderSetting(onChange: (enabled: boolean) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(React.createElement(AgentFileActivityAppearanceSetting, {
    enabled: false,
    workspaceRoot: "/workspace",
    onChange,
  }))));
}

function checkbox() {
  const element = document.querySelector<HTMLInputElement>("input[type='checkbox']");
  if (!element) throw new Error("missing Agent file activity switch");
  return element;
}

function primaryButton() {
  const element = document.querySelector<HTMLButtonElement>(".desktop-dialog-button.primary");
  if (!element) throw new Error("missing permission action");
  return element;
}

function nextTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function enrollment(providers: ReturnType<typeof provider>[]) {
  return { schemaVersion: 1 as const, providers };
}

function provider(
  providerId: string,
  configurable: boolean,
  enrollmentState: "not-configured" | "enabled" | "needs-repair" | "basic-only",
) {
  return {
    providerId,
    displayName: providerId,
    configurable,
    enrollment: enrollmentState,
  };
}

function localConnection(id: string, installation: "not-found" | "detected") {
  return {
    id,
    displayName: id,
    installation,
    version: null,
    authentication: "unknown" as const,
    integration: "inventory-only" as const,
    capabilities: { versionProbe: false, authenticationProbe: false, protocolProbe: false },
    selectable: false,
    statusMessage: id,
    actions: [],
  };
}

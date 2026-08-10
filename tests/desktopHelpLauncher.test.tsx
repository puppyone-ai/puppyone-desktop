/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopCloudShell } from "../src/components/DesktopCloudShell";
import { DesktopHelpLauncher } from "../src/features/app-shell/DesktopHelpLauncher";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let originalDesktopBridge: Window["puppyoneDesktop"];

beforeEach(() => {
  originalDesktopBridge = window.puppyoneDesktop;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  window.puppyoneDesktop = originalDesktopBridge;
  vi.restoreAllMocks();
});

function renderLauncher(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => renderWithTestLocalization(root, node));
  return container;
}

describe("DesktopHelpLauncher", () => {
  it("stays a quiet question-mark button and reveals a Feedback label", () => {
    const container = renderLauncher(<DesktopHelpLauncher />);
    const launcher = container.querySelector(
      'button.desktop-help-launcher[aria-label="Feedback"]',
    ) as HTMLButtonElement | null;

    expect(launcher).not.toBeNull();
    expect(launcher?.type).toBe("button");
    expect(launcher?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
    expect(launcher?.querySelector("svg")).not.toBeNull();
    expect(launcher?.querySelector(".desktop-help-launcher-label")?.textContent).toBe("Feedback");
    expect(container.querySelector("a")).toBeNull();
  });

  it("opens one minimal composer and sends only the typed feedback through the desktop bridge", async () => {
    const submitFeedback = vi.fn().mockResolvedValue({ ok: true });
    window.puppyoneDesktop = {
      submitFeedback,
    } as unknown as Window["puppyoneDesktop"];

    const container = renderLauncher(<DesktopHelpLauncher />);
    const launcher = container.querySelector<HTMLButtonElement>(".desktop-help-launcher");
    act(() => launcher?.click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(dialog).not.toBeNull();
    expect(launcher?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(textarea);
    expect(textarea?.placeholder).toBe("Feedback…");
    expect(dialog?.querySelector(".desktop-feedback-header")).toBeNull();
    expect(dialog?.querySelector(".desktop-feedback-close")).toBeNull();
    expect(dialog?.textContent).toBe("");
    expect(
      dialog?.querySelector<HTMLButtonElement>(".desktop-feedback-attach")
        ?.getAttribute("aria-label"),
    ).toBe("Attach screenshot");
    const submitButton = dialog?.querySelector<HTMLButtonElement>(".desktop-feedback-submit");
    expect(submitButton?.getAttribute("aria-label")).toBe("Send");
    expect(submitButton?.querySelector(".lucide-send")).not.toBeNull();
    expect(submitButton?.querySelector(".lucide-arrow-up")).toBeNull();

    act(() => {
      if (!textarea) return;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        textarea,
        "  Please make search faster.  ",
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const form = container.querySelector<HTMLFormElement>(".desktop-feedback-composer");
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(submitFeedback).toHaveBeenCalledWith({
      message: "Please make search faster.",
      locale: "en",
    });
    expect(container.querySelector(".desktop-feedback-status")?.textContent).toContain("Sent");
  });

  it("accepts a screenshot as the whole feedback and passes only its bytes and type", async () => {
    const submitFeedback = vi.fn().mockResolvedValue({ ok: true });
    window.puppyoneDesktop = {
      submitFeedback,
    } as unknown as Window["puppyoneDesktop"];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:feedback-preview");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const container = renderLauncher(<DesktopHelpLauncher />);
    act(() => container.querySelector<HTMLButtonElement>(".desktop-help-launcher")?.click());

    const input = container.querySelector<HTMLInputElement>(".desktop-feedback-file-input");
    const screenshotBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const screenshotFile = new File([screenshotBytes], "screen.png", {
      type: "image/png",
    });

    await act(async () => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [screenshotFile],
      });
      input?.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(
      container.querySelector<HTMLImageElement>(".desktop-feedback-screenshot img")?.src,
    ).toBe("blob:feedback-preview");

    await act(async () => {
      container
        .querySelector<HTMLFormElement>(".desktop-feedback-composer")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(submitFeedback).toHaveBeenCalledOnce();
    expect(submitFeedback).toHaveBeenCalledWith({
      message: "",
      locale: "en",
      screenshot: {
        bytes: expect.any(ArrayBuffer),
        mimeType: "image/png",
      },
    });

    act(() => container.querySelector<HTMLButtonElement>(".desktop-help-launcher")?.click());
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:feedback-preview");
  });

  it("belongs to the shrinking main surface instead of the Chat and Terminal panel", () => {
    const container = renderLauncher(
      <DesktopCloudShell
        rightSidebar={<div data-testid="auxiliary-panel">Chat or Terminal</div>}
        rightSidebarOpen
      >
        <div>Workspace</div>
        <DesktopHelpLauncher />
      </DesktopCloudShell>,
    );

    const mainSurface = container.querySelector("main.desktop-surface");
    const auxiliaryPanel = container.querySelector(".desktop-right-sidebar");
    const launcher = container.querySelector(".desktop-help-launcher");
    expect(mainSurface?.contains(launcher)).toBe(true);
    expect(auxiliaryPanel?.contains(launcher)).toBe(false);
  });

  it("uses the main surface as its logical-edge positioning boundary", () => {
    const layoutCss = readFileSync("src/styles/layout.css", "utf8");
    const launcherCss = readFileSync(
      "src/features/app-shell/desktop-help-launcher.css",
      "utf8",
    );

    expect(layoutCss).toMatch(/\.desktop-surface\s*\{[^}]*position:\s*relative/s);
    expect(launcherCss).toMatch(
      /\.desktop-feedback\s*\{[^}]*position:\s*absolute[^}]*inset-inline:\s*12px[^}]*inset-block-end:\s*12px/s,
    );
    expect(launcherCss).toMatch(
      /\.desktop-help-launcher:hover \.desktop-help-launcher-label/s,
    );
    expect(launcherCss).toMatch(
      /\.desktop-feedback-popover\s*\{[^}]*inset-block-end:\s*calc\(100% \+ 8px\)/s,
    );
    const launcherRule = launcherCss.match(/\.desktop-help-launcher\s*\{[^}]*\}/s)?.[0] ?? "";
    expect(launcherRule).toContain("border: 1px solid var(--po-border-subtle)");
    expect(launcherRule).toContain("background: var(--po-panel-raised)");
    expect(launcherRule).toContain("opacity: 1");
    expect(launcherRule).not.toContain("backdrop-filter");
    expect(launcherCss).toMatch(
      /\.desktop-help-launcher:hover,[\s\S]*?\.desktop-help-launcher:focus-visible\s*\{[^}]*background:\s*var\(--po-overlay\)[^}]*opacity:\s*1/s,
    );
    expect(launcherCss).toMatch(
      /\.desktop-feedback\[data-open="true"\] \.desktop-help-launcher\s*\{[^}]*background:\s*var\(--po-overlay\)[^}]*opacity:\s*1/s,
    );
    expect(launcherCss).not.toMatch(/position:\s*fixed/);
  });
});

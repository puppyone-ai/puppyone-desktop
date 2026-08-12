/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MinimalOnboarding, type MinimalOnboardingProps } from "../src/components/MinimalOnboarding";
import {
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  resolveTypography,
} from "../src/features/typography";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("project folder home", () => {
  it("uses theme-semantic contrast surfaces for project interaction states", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/onboarding.css`, "utf8");

    expect(css).toMatch(
      /\.onboarding-project-row:hover:not\(:disabled\),\s*\.onboarding-project-row:focus-visible\s*\{[^}]*background:\s*var\(--po-hover\);/s,
    );
    expect(css).toMatch(
      /\.onboarding-project-row:active:not\(:disabled\)\s*\{[^}]*background:\s*var\(--po-active\);/s,
    );
  });

  it("preserves the original folder action and recent-project list", async () => {
    const onChooseWorkspace = vi.fn(async () => undefined);
    const container = renderHome({
      onChooseWorkspace,
      projectItems: [{
        id: "notes",
        label: "/Users/example/Notes",
        localPath: "/Users/example/Notes",
        lastOpenedAt: null,
      }],
    });

    expect(container.querySelectorAll(".folder-drop-zone")).toHaveLength(1);
    expect(container.textContent).toContain("open or drop a folder");
    expect(container.textContent).toContain("~/example/Notes");
    expect(container.querySelector(".folder-drop-outline")).not.toBeNull();
    expect(container.querySelector(".folder-drop-icon.lucide-folder-open")).not.toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>(".folder-drop-primary-action")?.click());
    expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
  });

  it("uses the original folder artwork for drag feedback", () => {
    const container = renderHome();
    const surface = requireSurface(container);
    const folder = new File([], "Notes");
    const transfer = createTransfer([folder], [{ isDirectory: true }]);

    act(() => surface.dispatchEvent(createDragEvent("dragenter", transfer)));
    expect(container.querySelector(".folder-drop-zone")?.classList.contains("dragging")).toBe(true);
    expect(container.querySelector(".onboarding-folder-drop-overlay")).toBeNull();

    act(() => surface.dispatchEvent(createDragEvent("dragleave", transfer)));
    expect(container.querySelector(".folder-drop-zone")?.classList.contains("dragging")).toBe(false);
  });

  it("hands one folder File to the native workspace boundary", async () => {
    const onOpenDroppedWorkspace = vi.fn(async () => undefined);
    const container = renderHome({ onOpenDroppedWorkspace });
    const folder = new File([], "Notes");
    const transfer = createTransfer([folder], [{ isDirectory: true }]);

    await act(async () => {
      requireSurface(container).dispatchEvent(createDragEvent("drop", transfer));
      await Promise.resolve();
    });

    expect(onOpenDroppedWorkspace).toHaveBeenCalledTimes(1);
    expect(onOpenDroppedWorkspace).toHaveBeenCalledWith(folder);
  });

  it.each([
    ["a regular file", [new File(["hello"], "notes.md")], [{ isDirectory: false }]],
    ["multiple folders", [new File([], "One"), new File([], "Two")], [{ isDirectory: true }, { isDirectory: true }]],
  ])("rejects %s without starting a workspace open", async (_label, files, entries) => {
    const onOpenDroppedWorkspace = vi.fn(async () => undefined);
    const container = renderHome({ onOpenDroppedWorkspace });

    await act(async () => {
      requireSurface(container).dispatchEvent(createDragEvent("drop", createTransfer(files, entries)));
      await Promise.resolve();
    });

    expect(onOpenDroppedWorkspace).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")?.textContent).toContain("Drop a local folder");
  });
});

function renderHome(overrides: Partial<MinimalOnboardingProps> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const props: MinimalOnboardingProps = {
    onChooseWorkspace: vi.fn(async () => undefined),
    onOpenDroppedWorkspace: vi.fn(async () => undefined),
    onOpenWorkspacePath: vi.fn(async () => undefined),
    themeMode: "dark",
    lightThemePreset: "neutral",
    darkThemePreset: "default",
    textSize: "default",
    typography: resolveTypography(DEFAULT_TYPOGRAPHY_PREFERENCES),
    pointerCursors: false,
    diffMarkers: "color",
    resolvedTheme: "dark",
    ...overrides,
  };
  act(() => renderWithTestLocalization(root, React.createElement(MinimalOnboarding, props)));
  return container;
}

function requireSurface(container: HTMLElement): HTMLElement {
  const surface = container.querySelector<HTMLElement>(".onboarding-homepage-shell");
  if (!surface) throw new Error("Project home surface is missing.");
  return surface;
}

function createDragEvent(type: string, dataTransfer: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  return event;
}

function createTransfer(
  files: File[],
  entries: Array<{ isDirectory: boolean }>,
): DataTransfer {
  const fileList = Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList;
  const items = entries.map((entry) => ({
    kind: "file",
    webkitGetAsEntry: () => ({
      isDirectory: entry.isDirectory,
      isFile: !entry.isDirectory,
      name: "entry",
      fullPath: "/entry",
      filesystem: {},
      getParent: () => undefined,
    }),
  }));
  return {
    files: fileList,
    items,
    types: ["Files"],
    dropEffect: "none",
  } as unknown as DataTransfer;
}

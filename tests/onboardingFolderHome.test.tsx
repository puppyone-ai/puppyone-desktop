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
const originalClipboard = navigator.clipboard;
const originalConfirm = window.confirm;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: originalConfirm,
  });
});

describe("project folder home", () => {
  it("uses editor menu rows inside one padded developer-panel frame", () => {
    const css = readFileSync(`${process.cwd()}/src/styles/onboarding.css`, "utf8");
    const container = renderHome({
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });

    expect(container.querySelector(".onboarding-project-row")?.classList.contains("desktop-menu-item")).toBe(true);
    expect(container.textContent).toContain("Local Projects");
    expect(css).toMatch(/\.onboarding-recent-projects\s*\{[^}]*padding:\s*18px;[^}]*border:\s*1px solid var\(--po-border\);[^}]*border-radius:\s*0;/s);
    expect(css).toMatch(/\.onboarding-homepage\.has-projects \.onboarding-recent-projects\s*\{[^}]*height:\s*fit-content;[^}]*max-height:\s*none;[^}]*align-self:\s*start;[^}]*overflow:\s*visible;/s);
    expect(css).toMatch(/\.onboarding-recent-heading\s*\{[^}]*background:\s*var\(--po-canvas\);[^}]*color:\s*var\(--po-text-subtle\);[^}]*font-family:\s*var\(--po-font-sans\);[^}]*font-size:\s*11\.5px;[^}]*font-weight:\s*500;/s);
    expect(css).toMatch(/\.onboarding-recent-header\s*\{[^}]*inset-inline:\s*22px 6px;/s);
    expect(css).toMatch(/\.onboarding-homepage\.has-projects\s*\{[^}]*height:\s*fit-content;[^}]*gap:\s*0;/s);
    expect(css).toMatch(/\.onboarding-projects-layout\s*\{[^}]*height:\s*fit-content;[^}]*max-height:\s*100%;[^}]*grid-template-rows:\s*186px auto;[^}]*justify-items:\s*center;[^}]*gap:\s*28px;/s);
    expect(css).toMatch(/\.onboarding-folder-compact-action\s*\{[^}]*width:\s*186px;[^}]*height:\s*186px;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*var\(--po-text-muted\);[^}]*transform:\s*none;/s);
    expect(css).toMatch(/\.onboarding-folder-compact-body\s*\{[^}]*font-size:\s*13px;[^}]*font-weight:\s*500;[^}]*line-height:\s*18px;/s);
    expect(css).toMatch(/\.onboarding-folder-compact-border\s*\{[^}]*stroke:\s*var\(--po-border\);[^}]*stroke-dasharray:\s*4 4;/s);
    expect(css).toMatch(/\.onboarding-project-list\s*\{[^}]*align-content:\s*start;[^}]*gap:\s*2px;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
    expect(css).not.toMatch(/\.onboarding-project-row\s*\{[^}]*height:/s);
    expect(css).toMatch(/\.onboarding-project-row-wrap:hover \.onboarding-project-remove,[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s);
    expect(css).toMatch(/\.desktop-menu-icon-button\.onboarding-project-remove:hover:not\(:disabled\),[^}]*background:\s*color-mix\(in srgb, var\(--po-danger\) 10%, transparent\);[^}]*color:\s*var\(--po-danger\);/s);
    expect(css).toMatch(/\.onboarding-project-row-wrap:hover \.onboarding-project-row:not\(:disabled\),[^}]*background:\s*var\(--po-hover\);[^}]*color:\s*var\(--po-text\);/s);
    expect(css).not.toMatch(/\.onboarding-project-row\s*\+\s*\.onboarding-project-row/);
  });

  it("moves the folder action above the project list when projects exist", async () => {
    const onChooseWorkspace = vi.fn(async () => undefined);
    const container = renderHome({
      onChooseWorkspace,
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });

    expect(container.querySelectorAll(".folder-drop-zone")).toHaveLength(0);
    expect(container.querySelectorAll(".onboarding-folder-compact-action")).toHaveLength(1);
    expect(container.querySelector(".onboarding-folder-compact-outline")).not.toBeNull();
    expect(container.querySelector(".onboarding-folder-compact-outline")?.getAttribute("viewBox")).toBe("0 0 260 260");
    expect(container.querySelector(".onboarding-folder-compact-action .lucide-folder-open")).not.toBeNull();
    const layout = container.querySelector(".onboarding-projects-layout");
    expect(layout?.firstElementChild?.classList.contains("onboarding-folder-compact-action")).toBe(true);
    expect(layout?.lastElementChild?.classList.contains("onboarding-recent-projects")).toBe(true);
    expect(container.textContent).toContain("open or drop a folder");
    expect(container.querySelector(".desktop-menu-item-label")?.textContent).toBe("Notes");
    expect(container.querySelector(".desktop-menu-item-detail")?.textContent).toBe("~/Desktop");
    expect(container.querySelector(".desktop-menu-item-trailing")?.textContent).toContain("Previously opened");

    await act(async () => container.querySelector<HTMLButtonElement>(".onboarding-folder-compact-action")?.click());
    expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
  });

  it("keeps the original folder action centered when there are no projects", () => {
    const container = renderHome();

    expect(container.querySelectorAll(".folder-drop-zone")).toHaveLength(1);
    expect(container.querySelector(".onboarding-folder-compact-action")).toBeNull();
    expect(container.querySelector(".folder-drop-outline")).not.toBeNull();
    expect(container.querySelector(".folder-drop-icon.lucide-folder-open")).not.toBeNull();
  });

  it("shows project-opening progress only inside the project row", async () => {
    let finishOpening: (() => void) | null = null;
    const onOpenWorkspacePath = vi.fn(() => new Promise<void>((resolve) => {
      finishOpening = resolve;
    }));
    const container = renderHome({
      onOpenWorkspacePath,
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });
    const row = container.querySelector<HTMLButtonElement>(".onboarding-project-row");

    await act(async () => {
      row?.click();
      await Promise.resolve();
    });

    expect(row?.querySelectorAll("[data-puppy-loader]")).toHaveLength(1);
    expect(container.querySelector(".onboarding-operation-status")).toBeNull();
    expect(container.querySelector(".onboarding-folder-compact-action [data-puppy-loader]")).toBeNull();

    await act(async () => finishOpening?.());
  });

  it("shows folder-opening progress only inside the folder action", async () => {
    let finishOpening: (() => void) | null = null;
    const onChooseWorkspace = vi.fn(() => new Promise<void>((resolve) => {
      finishOpening = resolve;
    }));
    const container = renderHome({
      onChooseWorkspace,
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });
    const folderAction = container.querySelector<HTMLButtonElement>(".onboarding-folder-compact-action");

    await act(async () => {
      folderAction?.click();
      await Promise.resolve();
    });

    expect(folderAction?.querySelectorAll("[data-puppy-loader]")).toHaveLength(1);
    expect(container.querySelector(".onboarding-operation-status")).toBeNull();
    expect(container.querySelector(".onboarding-project-row [data-puppy-loader]")).toBeNull();

    await act(async () => finishOpening?.());
  });

  it("removes one registration without opening the project", async () => {
    const onOpenWorkspacePath = vi.fn(async () => undefined);
    const onRemoveProject = vi.fn(async () => undefined);
    const confirm = vi.fn(() => true);
    Object.defineProperty(window, "confirm", { configurable: true, value: confirm });
    const container = renderHome({
      onOpenWorkspacePath,
      onRemoveProject,
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });
    const removeButton = container.querySelector<HTMLButtonElement>(".onboarding-project-remove");

    expect(removeButton?.getAttribute("aria-label")).toContain("Remove");
    expect(removeButton?.title).toBe("Removes this registration only. Local files are not deleted.");
    expect(removeButton?.querySelector(".lucide-unlink")).not.toBeNull();
    expect(removeButton?.querySelector(".lucide-x")).toBeNull();
    await act(async () => removeButton?.click());

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Local files will stay on disk/));
    expect(onRemoveProject).toHaveBeenCalledWith("/Users/example/Desktop/Notes");
    expect(onOpenWorkspacePath).not.toHaveBeenCalled();
  });

  it("keeps a project registered when unlink confirmation is cancelled", async () => {
    const onRemoveProject = vi.fn(async () => undefined);
    Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => false) });
    const container = renderHome({
      onRemoveProject,
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });

    await act(async () => container.querySelector<HTMLButtonElement>(".onboarding-project-remove")?.click());

    expect(onRemoveProject).not.toHaveBeenCalled();
    expect(container.querySelector(".onboarding-project-row")).not.toBeNull();
  });

  it("copies the absolute project path and exposes it as text when dragging a row", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const container = renderHome({
      projectItems: [{
        id: "notes",
        label: "Notes",
        localPath: "/Users/example/Desktop/Notes",
        lastOpenedAt: null,
      }],
    });
    const row = container.querySelector<HTMLButtonElement>(".onboarding-project-row");
    const transfer = createTextTransfer();

    await act(async () => {
      row?.dispatchEvent(createDragEvent("dragstart", transfer));
      await Promise.resolve();
    });

    expect(row?.getAttribute("draggable")).toBe("true");
    expect(transfer.effectAllowed).toBe("copy");
    expect(transfer.getData("text/plain")).toBe("/Users/example/Desktop/Notes");
    expect(writeText).toHaveBeenCalledWith("/Users/example/Desktop/Notes");
    expect(row?.parentElement?.classList.contains("is-dragging")).toBe(true);

    act(() => row?.dispatchEvent(createDragEvent("dragend", transfer)));
    expect(row?.parentElement?.classList.contains("is-dragging")).toBe(false);
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

function createTextTransfer(): DataTransfer {
  const values = new Map<string, string>();
  return {
    files: Object.assign([], { item: () => null }) as unknown as FileList,
    items: [],
    types: [],
    dropEffect: "none",
    effectAllowed: "none",
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
  } as unknown as DataTransfer;
}

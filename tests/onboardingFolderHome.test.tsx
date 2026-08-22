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
  it("expands the right sidebar when a workspace becomes active", () => {
    const appSource = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
    const activationStart = appSource.indexOf("onWorkspaceActivated: useCallback");
    const activationEnd = appSource.indexOf("onWorkspaceCleared:", activationStart);

    expect(activationStart).toBeGreaterThanOrEqual(0);
    expect(activationEnd).toBeGreaterThan(activationStart);
    expect(appSource.slice(activationStart, activationEnd)).toContain(
      "setRightSidebarOpen(true)",
    );
  });

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
    expect(css).toMatch(/\.onboarding-homepage\.has-projects\s*\{[^}]*width:\s*min\(760px, 100%\);[^}]*height:\s*fit-content;[^}]*gap:\s*16px;/s);
    expect(css).toMatch(/\.onboarding-projects-layout\s*\{[^}]*width:\s*min\(680px, 100%\);[^}]*height:\s*fit-content;[^}]*max-height:\s*100%;[^}]*justify-self:\s*center;/s);
    expect(css).toMatch(/\.onboarding-project-add\s*\{[^}]*margin-top:\s*8px;[^}]*padding-top:\s*8px;[^}]*border-top:\s*1px solid var\(--po-divider\);/s);
    expect(css).toMatch(/\.onboarding-project-add-action\s*\{[^}]*width:\s*100%;[^}]*color:\s*var\(--po-text-subtle\);/s);
    expect(css).toMatch(/\.onboarding-shell\.dragging \.onboarding-recent-projects\s*\{[^}]*border-color:\s*var\(--po-border-strong\);/s);
    expect(css).toMatch(/\.onboarding-project-list\s*\{[^}]*align-content:\s*start;[^}]*gap:\s*2px;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
    expect(css).not.toMatch(/\.onboarding-project-row\s*\{[^}]*height:/s);
    expect(css).toMatch(/\.onboarding-project-row-wrap:hover \.onboarding-project-remove,[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s);
    expect(css).toMatch(/\.desktop-menu-icon-button\.onboarding-project-remove:hover:not\(:disabled\),[^}]*background:\s*color-mix\(in srgb, var\(--po-danger\) 10%, transparent\);[^}]*color:\s*var\(--po-danger\);/s);
    expect(css).toMatch(/\.onboarding-project-row-wrap:hover \.onboarding-project-row:not\(:disabled\),[^}]*background:\s*var\(--po-hover\);[^}]*color:\s*var\(--po-text\);/s);
    expect(css).not.toMatch(/\.onboarding-project-row\s*\+\s*\.onboarding-project-row/);
  });

  it("keeps the original lightweight folder action inside the project panel", async () => {
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
    expect(container.querySelector(".onboarding-brand-lockup")).toBeNull();
    const panel = container.querySelector(".onboarding-recent-projects");
    expect(panel?.lastElementChild?.classList.contains("onboarding-project-add")).toBe(true);
    const projectFolder = container.querySelector(".onboarding-project-row .lucide-folder");
    const addFolder = container.querySelector(".onboarding-project-folder-add-icon .lucide-folder");
    expect(projectFolder).not.toBeNull();
    expect(addFolder).not.toBeNull();
    expect(addFolder?.getAttribute("width")).toBe(projectFolder?.getAttribute("width"));
    expect(addFolder?.getAttribute("height")).toBe(projectFolder?.getAttribute("height"));
    expect(addFolder?.getAttribute("stroke-width")).toBe(projectFolder?.getAttribute("stroke-width"));
    expect(container.querySelector(".onboarding-project-add-action")?.textContent).toContain("Open local folder");
    expect(container.querySelector(".desktop-menu-item-label")?.textContent).toBe("Notes");
    expect(container.querySelector(".desktop-menu-item-detail")?.textContent).toBe("~/Desktop");
    expect(container.querySelector(".desktop-menu-item-trailing")?.textContent).toContain("Previously opened");

    await act(async () => container.querySelector<HTMLButtonElement>(".onboarding-project-add-action")?.click());
    expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
  });

  it("uses two compact actions and a separate clone-provider strip when there are no projects", async () => {
    const css = readFileSync(`${process.cwd()}/src/styles/onboarding.css`, "utf8");
    const onChooseWorkspace = vi.fn(async () => undefined);
    const onCreateProject = vi.fn(async () => true);
    const onCloneRepository = vi.fn(async () => true);
    const container = renderHome({ onChooseWorkspace, onCreateProject, onCloneRepository });

    expectBrandLockup(container);
    const actions = [...container.querySelectorAll<HTMLButtonElement>(".onboarding-entry-action")];
    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.textContent)).toEqual([
      "Open local folder",
      "Create local project",
    ]);
    expect(actions.every((action) => action.classList.contains("po-button"))).toBe(true);
    expect(actions[0]?.classList.contains("po-button--primary")).toBe(true);
    expect(actions[1]?.classList.contains("po-button--neutral")).toBe(true);
    expect(actions[0]?.classList.contains("onboarding-entry-action-primary")).toBe(true);
    expect(actions[0]?.querySelector(".lucide-folder-open")).not.toBeNull();
    expect(actions[1]?.querySelector(".onboarding-entry-create-icon")).not.toBeNull();
    const providers = [...container.querySelectorAll<HTMLButtonElement>(".onboarding-provider-action")];
    expect(container.querySelector(".onboarding-provider-label")?.textContent).toBe("Import from");
    expect(container.querySelector(".onboarding-provider-arrow")).not.toBeNull();
    expect(providers.map((provider) => provider.dataset.provider)).toEqual(["github"]);
    expect(providers[0]?.disabled).toBe(false);
    expect(providers[0]?.querySelector(".lucide-github")).not.toBeNull();
    expect(container.querySelector("[data-provider='gitlab']")).toBeNull();
    expect(container.querySelector("[data-provider='notion']")).toBeNull();
    expect(container.querySelector(".onboarding-project-add-action")).toBeNull();
    expect(css).toMatch(/\.onboarding-homepage\s*\{[^}]*width:\s*min\(480px, 100%\);[^}]*align-content:\s*start;[^}]*gap:\s*30px;/s);
    expect(css).toMatch(/\.onboarding-homepage\.is-empty\s*\{[^}]*width:\s*min\(450px, 100%\);[^}]*min-height:\s*min\(430px, 100%\);[^}]*align-content:\s*center;[^}]*gap:\s*42px;/s);
    expect(css).toMatch(/\.onboarding-brand-lockup\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*center;[^}]*justify-self:\s*center;[^}]*gap:\s*12px;/s);
    expect(css).toMatch(/\.onboarding-brand-lockup\s*\{[^}]*color:\s*var\(--po-text-muted\);/s);
    expect(css).toMatch(/\.onboarding-brand-mark\s*\{[^}]*width:\s*60px;[^}]*height:\s*60px;/s);
    expect(css).not.toContain(".onboarding-brand-version");
    expect(css).toMatch(/\.onboarding-primary-area\s*\{[^}]*justify-items:\s*center;/s);
    expect(css).toMatch(/\.onboarding-entry-launcher\s*\{[^}]*width:\s*min\(272px, 100%\);[^}]*gap:\s*18px;/s);
    expect(css).toMatch(/\.onboarding-entry-actions\s*\{[^}]*gap:\s*10px;/s);
    expect(css).toMatch(/\.onboarding-entry-action\s*\{[^}]*width:\s*100%;[^}]*height:\s*38px;[^}]*min-height:\s*38px;[^}]*justify-content:\s*flex-start;[^}]*border-radius:\s*var\(--desktop-control-radius\);[^}]*font-size:\s*var\(--po-text-size-body, 13px\);[^}]*font-weight:\s*var\(--po-text-weight-medium, 500\);[^}]*text-align:\s*start;/s);
    expect(css).toMatch(/\.onboarding-entry-action-primary\s*\{[^}]*background:\s*var\(--po-text\);[^}]*color:\s*var\(--po-text-inverse\);[^}]*font-weight:\s*var\(--po-text-weight-semibold, 600\);/s);
    expect(css).toMatch(/\.onboarding-entry-action-secondary\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--po-text-subtle\);/s);
    expect(css).toMatch(/\.onboarding-provider-label\s*\{[^}]*font-size:\s*var\(--po-text-size-body, 13px\);/s);
    expect(css).toMatch(/\.onboarding-provider-action\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
    expect(css).not.toContain(".folder-drop-zone");

    await act(async () => actions[0]?.click());
    expect(onChooseWorkspace).toHaveBeenCalledTimes(1);
    expect(onCreateProject).not.toHaveBeenCalled();
    expect(onCloneRepository).not.toHaveBeenCalled();
  });

  it("collects one focused value for Create New and Import from GitHub", async () => {
    const onCreateProject = vi.fn(async () => true);
    const onCloneRepository = vi.fn(async () => true);
    const container = renderHome({ onCreateProject, onCloneRepository });

    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>(".onboarding-entry-action")[1]?.click();
    });
    expect(container.querySelector("[role='dialog']")?.getAttribute("aria-label")).toBe("Create a local project");
    const projectName = container.querySelector<HTMLInputElement>(".onboarding-entry-dialog input");
    expect(projectName?.placeholder).toBe("My project");
    setInputValue(projectName, "Knowledge Base");
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".onboarding-entry-dialog button[type='submit']")?.click();
      await Promise.resolve();
    });
    expect(onCreateProject).toHaveBeenCalledWith({ name: "Knowledge Base" });
    expect(container.querySelector(".onboarding-entry-dialog")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".onboarding-provider-action[data-provider='github']")?.click();
    });
    expect(container.querySelector("[role='dialog']")?.getAttribute("aria-label")).toBe("Import from GitHub");
    const repositoryUrl = container.querySelector<HTMLInputElement>(".onboarding-entry-dialog input");
    expect(repositoryUrl?.inputMode).toBe("url");
    setInputValue(repositoryUrl, "https://github.com/puppyone-ai/puppyone.git");
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".onboarding-entry-dialog button[type='submit']")?.click();
      await Promise.resolve();
    });
    expect(onCloneRepository).toHaveBeenCalledWith({
      repositoryUrl: "https://github.com/puppyone-ai/puppyone.git",
    });
    expect(container.querySelector(".onboarding-entry-dialog")).toBeNull();
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
    expect(container.querySelector(".onboarding-project-add-action [data-puppy-loader]")).toBeNull();

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
    const folderAction = container.querySelector<HTMLButtonElement>(".onboarding-project-add-action");

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

  it("highlights the primary folder action for drag feedback", () => {
    const container = renderHome();
    const surface = requireSurface(container);
    const folder = new File([], "Notes");
    const transfer = createTransfer([folder], [{ isDirectory: true }]);

    act(() => surface.dispatchEvent(createDragEvent("dragenter", transfer)));
    expect(container.querySelector(".onboarding-entry-action-primary")?.classList.contains("is-dragging")).toBe(true);
    expect(container.querySelector(".onboarding-folder-drop-overlay")).toBeNull();

    act(() => surface.dispatchEvent(createDragEvent("dragleave", transfer)));
    expect(container.querySelector(".onboarding-entry-action-primary")?.classList.contains("is-dragging")).toBe(false);
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

function expectBrandLockup(container: HTMLElement) {
  const lockup = container.querySelector(".onboarding-brand-lockup");
  const mark = lockup?.querySelector<HTMLImageElement>(".onboarding-brand-mark");
  expect(mark?.getAttribute("src")).toContain("logo-square-v0.1.4-dark.png");
  expect(mark?.getAttribute("alt")).toBe("");
  expect(lockup?.querySelector(".onboarding-brand-name")?.textContent).toBe("puppyone");
  expect(lockup?.querySelector(".onboarding-brand-version")).toBeNull();
  expect(container.querySelector(".onboarding-brand-context")).toBeNull();
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

function setInputValue(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("Project entry input is missing.");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

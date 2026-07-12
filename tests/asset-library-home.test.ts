/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetLibraryHome } from "../src/components/AssetLibraryHome";
import type { MinimalOnboardingProps, ProjectHomeItem } from "../src/components/MinimalOnboarding";
import {
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  resolveTypography,
} from "../src/features/typography";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Asset Library homepage", () => {
  it("presents Cloud and local projects as one filterable asset library", () => {
    const container = renderLibrary();

    expect(container.textContent).toContain("Projects");
    expect(container.textContent).not.toContain("3 assets · 1 synced · 2 on this Mac");
    expect(container.textContent).toContain("Local Notes");
    expect(container.textContent).toContain("Brand System");
    expect(container.textContent).toContain("Cloud Atlas");
    expect(container.querySelectorAll(".asset-library-card-cover")).toHaveLength(3);
    expect(container.querySelectorAll(".asset-library-new-project")).toHaveLength(1);
    expect(container.textContent?.indexOf("New Cloud project")).toBeGreaterThan(
      container.textContent?.indexOf("Cloud Atlas") ?? -1,
    );

    act(() => findFilterButton(container, "Cloud").click());
    expect(container.textContent).not.toContain("Local Notes");
    expect(container.textContent).toContain("Brand System");
    expect(container.textContent).toContain("Cloud Atlas");

    act(() => findFilterButton(container, "On this Mac").click());
    expect(container.textContent).toContain("Local Notes");
    expect(container.textContent).toContain("Brand System");
    expect(container.textContent).not.toContain("Cloud Atlas");
  });

  it("opens a local asset through the existing workspace callback", async () => {
    const onOpenWorkspacePath = vi.fn(async () => undefined);
    const container = renderLibrary({ onOpenWorkspacePath });
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open Local Notes"]');
    if (!button) throw new Error("Local asset button is missing.");

    await act(async () => button.click());

    expect(onOpenWorkspacePath).toHaveBeenCalledWith("/Users/example/Local Notes");
  });

  it("hides Create in Cloud when cloud-only creation is unavailable", () => {
    const container = renderLibrary({ onCreateCloudProject: undefined });

    expect(container.textContent).toContain("New project");
    expect(container.textContent).not.toContain("New Cloud project");
    expect(container.textContent).not.toContain("Create in Cloud");
  });
});

function renderLibrary(overrides: Partial<MinimalOnboardingProps> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const props: MinimalOnboardingProps = {
    onChooseWorkspace: vi.fn(async () => undefined),
    onCreateCloudProject: vi.fn(async () => undefined),
    onOpenCloudProject: vi.fn(async () => undefined),
    onOpenWorkspacePath: vi.fn(async () => undefined),
    projectItems: items,
    cloudSignedIn: true,
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

  act(() => root?.render(React.createElement(AssetLibraryHome, props)));
  return container;
}

function findFilterButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>(".asset-library-home-filter-row button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing ${label} filter.`);
  return button;
}

const items: ProjectHomeItem[] = [
  {
    id: "local-notes",
    kind: "local",
    label: "/Users/example/Local Notes",
    localPath: "/Users/example/Local Notes",
    lastOpenedAt: "2026-07-10T10:00:00.000Z",
  },
  {
    id: "brand-system",
    kind: "cloud-local",
    label: "/Users/example/brand-system",
    detail: "Brand System",
    localPath: "/Users/example/brand-system",
    cloudProjectId: "cloud-brand",
    lastOpenedAt: "2026-07-09T10:00:00.000Z",
  },
  {
    id: "cloud-atlas",
    kind: "cloud",
    label: "Cloud Atlas",
    cloudProjectId: "cloud-atlas",
    updatedAt: "2026-07-08T10:00:00.000Z",
  },
];

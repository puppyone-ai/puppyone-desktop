/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubProviderSection } from "../src/features/source-control/sidebar/SourceControlSidebarSections";
import type { GitScmSyncSection } from "../src/features/source-control/types";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
});

describe("GitHub provider section", () => {
  it("keeps a calm two-line identity when the tracked branch has no incoming updates", () => {
    const surface = renderProvider(createSection());

    expect(surface.textContent).toContain("GitHub");
    expect(surface.textContent).toContain("owner/repository");
    expect(surface.textContent).not.toContain("Empty");
    expect(surface.querySelector(".desktop-git-section-count-badge")).toBeNull();
    expect(surface.querySelector(".desktop-git-remote-action")).toBeNull();
    expect(surface.querySelector(".desktop-git-hosting-identity-row")).not.toBeNull();
    expect(surface.querySelector(".desktop-git-hosting-repository-row")).not.toBeNull();
  });

  it("summarizes incoming file states, discloses files, and pulls in one click", async () => {
    const onPull = vi.fn(async () => true);
    const onSelectWorkingFile = vi.fn();
    const onToggleExpanded = vi.fn();
    const surface = renderProvider(createSection({
      copy: { title: "Remote Changes", count: 2, detail: "origin/main", tone: "warning" },
      action: {
        kind: "pull",
        label: "Pull",
        loadingLabel: "Pulling…",
        title: "Pull 2 commits from origin/main.",
        disabled: false,
        icon: "download",
      },
      previewResources: [
        {
          id: "remote::policy.md:modified",
          group: "workingTree",
          path: "policy.md",
          oldPath: null,
          status: "modified",
          staged: false,
          conflict: false,
          letter: "M",
        },
        {
          id: "remote::guide.md:added",
          group: "workingTree",
          path: "guide.md",
          oldPath: null,
          status: "added",
          staged: false,
          conflict: false,
          letter: "A",
        },
      ],
    }), { expanded: true, onPull, onSelectWorkingFile, onToggleExpanded });

    expect(surface.querySelector(".desktop-git-resource-summary-total")?.textContent).toBe("2");
    expect(surface.querySelector('[data-resource-status="added"]')?.textContent).toBe("A1");
    expect(surface.querySelector('[data-resource-status="modified"]')?.textContent).toBe("M1");
    expect(surface.querySelector('[data-resource-status="modified"]')?.getAttribute("aria-label")).toContain("policy.md");
    expect(surface.textContent).toContain("policy.md");
    expect(surface.textContent).not.toContain("Empty");

    const pullButton = surface.querySelector<HTMLButtonElement>(".desktop-git-remote-action");
    const disclosureButton = surface.querySelector<HTMLButtonElement>(".desktop-git-hosting-repository-disclosure");
    const fileButton = surface.querySelector<HTMLButtonElement>(".desktop-working-tree-main");
    const modifiedSummary = surface.querySelector<HTMLElement>('[data-resource-status="modified"]');
    act(() => modifiedSummary?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(document.body.querySelector(".desktop-git-resource-tooltip")?.textContent).toContain("policy.md");
    await act(async () => pullButton?.click());
    act(() => disclosureButton?.click());
    act(() => fileButton?.click());

    expect(onPull).toHaveBeenCalledTimes(1);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    expect(onSelectWorkingFile).toHaveBeenCalledWith({
      path: "policy.md",
      status: "modified",
      staged: false,
      origin: "remote",
    });
  });
});

function createSection(overrides: Partial<GitScmSyncSection> = {}): GitScmSyncSection {
  return {
    copy: { title: "Remote Changes", count: 0, detail: "origin/main", tone: "ready" },
    action: null,
    previewResources: [],
    fallbackSummary: null,
    ...overrides,
  };
}

function renderProvider(
  section: GitScmSyncSection,
  callbacks: {
    expanded?: boolean;
    onPull?: () => Promise<boolean>;
    onSelectWorkingFile?: ReturnType<typeof vi.fn>;
    onToggleExpanded?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(withTestLocalization(
    <GitHubProviderSection
      identity={{ provider: "github", label: "owner/repository", href: null }}
      section={section}
      mergeCount={0}
      expanded={callbacks.expanded ?? false}
      fileIconTheme="default"
      selectedWorkingFile={null}
      disabled={false}
      operationLoading={null}
      primaryAction={true}
      onToggleExpanded={callbacks.onToggleExpanded ?? vi.fn()}
      onSelectWorkingFile={callbacks.onSelectWorkingFile ?? vi.fn()}
      onPull={callbacks.onPull ?? (async () => true)}
    />,
  )));
  return container;
}

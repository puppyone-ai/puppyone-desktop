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
  it("uses the GitHub label as the repository link when there are no incoming updates", () => {
    const surface = renderProvider(createSection());

    expect(surface.textContent).toContain("GitHub");
    expect(surface.textContent).not.toContain("owner/repository");
    expect(surface.textContent).not.toContain("Empty");
    expect(surface.querySelector(".desktop-git-section-count-badge")).toBeNull();
    expect(surface.querySelector(".desktop-git-remote-action")).toBeNull();
    expect(surface.querySelector(".desktop-git-hosting-identity-row")).not.toBeNull();
    expect(surface.querySelector<HTMLAnchorElement>(".desktop-git-hosting-identity-link")?.href)
      .toBe("https://github.com/owner/repository");
    expect(surface.querySelector(".desktop-git-hosting-repository-row")).toBeNull();
  });

  it("makes the change total primary and shows the remote update age", async () => {
    const onPull = vi.fn(async () => true);
    const incomingUpdatedAt = new Date(Date.now() - ((2 * 60 * 60 * 1000) + 10_000)).toISOString();
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
    }), {
      onPull,
      incomingUpdatedAt,
      incomingFileSummary: {
        total: 96,
        added: 4,
        modified: 89,
        deleted: 2,
        renamed: 1,
        copied: 0,
        changed: 0,
      },
    });

    expect(surface.querySelector(".desktop-git-github-change-card")).not.toBeNull();
    expect(surface.textContent).not.toContain("2 commits");
    expect(surface.textContent).toContain("96 changes");
    expect(surface.querySelector(".desktop-git-github-update-age")?.textContent).toBe("2 hours ago");
    expect(surface.querySelector(".desktop-git-github-update-age")?.getAttribute("datetime")).toBe(incomingUpdatedAt);
    expect(surface.querySelector(".desktop-git-github-file-total")?.textContent).toBe("96 changes");
    expect(surface.querySelector(".desktop-git-github-file-stats")).toBeNull();
    expect(surface.textContent).not.toContain("Update policy");
    expect(surface.textContent).not.toContain("Add guide");
    expect(surface.querySelector("[data-resource-status]")).toBeNull();
    expect(surface.querySelector(".desktop-working-tree-main")).toBeNull();
    expect(surface.textContent).not.toContain("Empty");

    const card = surface.querySelector(".desktop-git-github-change-card");
    const identityRow = surface.querySelector(".desktop-git-hosting-identity-row");
    const pullButton = surface.querySelector<HTMLButtonElement>(".desktop-git-remote-action");
    expect(Array.from(card?.children ?? []).slice(0, 2).map((child) => child.className)).toEqual([
      "desktop-git-github-update-age",
      "desktop-git-github-file-total",
    ]);
    expect(card?.contains(pullButton ?? null)).toBe(true);
    expect(identityRow?.contains(pullButton ?? null)).toBe(false);
    await act(async () => pullButton?.click());

    expect(onPull).toHaveBeenCalledTimes(1);
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
    incomingUpdatedAt?: string;
    incomingFileSummary?: {
      total: number;
      added: number;
      modified: number;
      deleted: number;
      renamed: number;
      copied: number;
      changed: number;
    };
    onPull?: () => Promise<boolean>;
  } = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(withTestLocalization(
    <GitHubProviderSection
      identity={{ provider: "github", label: "owner/repository", href: "https://github.com/owner/repository" }}
      section={section}
      incomingUpdatedAt={callbacks.incomingUpdatedAt ?? null}
      incomingFileSummary={callbacks.incomingFileSummary ?? {
        total: 0,
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        copied: 0,
        changed: 0,
      }}
      mergeCount={0}
      disabled={false}
      operationLoading={null}
      primaryAction={true}
      onPull={callbacks.onPull ?? (async () => true)}
    />,
  )));
  return container;
}

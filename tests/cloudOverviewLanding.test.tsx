/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@puppyone/shared-ui";
import { CloudRepositoryOverview } from "../src/features/cloud/sections/overview";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("CloudRepositoryOverview landing page", () => {
  it("uses an in-app action dashboard without promoting the web route", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));
    const onRefresh = vi.fn(async () => undefined);
    const onSelectSection = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(withTestLocalization(
      <CloudRepositoryOverview
        workspace={WORKSPACE}
        project={{
          id: "project-1",
          name: "Atlas",
          description: "Shared product research",
          visibility: "private",
          bound_git_branch: "release",
          access_point_count: 0,
        }}
        dashboard={{
          project: {
            id: "project-1",
            name: "Atlas",
            description: "Shared product research",
          },
          nodes: {
            total: 8,
            folders: 3,
            files: 5,
          },
          connections: [],
          tools: [],
          uploads: [],
        }}
        history={{
          project_id: "project-1",
          commits: [{
            commit_id: HEAD_COMMIT_ID,
            parent_ids: [PARENT_COMMIT_ID],
            who: "Ada",
            message: "Ship the project dashboard",
            changes: [{ path: "dashboard.md", op: "modified" }],
            conflicts: [],
            root_hash: "root-1",
            scope_hash: "scope-1",
            scope_path: "",
            created_at: "2026-07-18T12:00:00.000Z",
            audit_detail: null,
          }, {
            commit_id: PARENT_COMMIT_ID,
            parent_ids: [],
            who: "Grace",
            message: "Create the Cloud project",
            changes: [{ path: "README.md", op: "added" }],
            conflicts: [],
            root_hash: "root-0",
            scope_hash: "scope-0",
            scope_path: "",
            created_at: "2026-07-17T12:00:00.000Z",
            audit_detail: null,
          }],
          topology_available: true,
          head_commit_id: HEAD_COMMIT_ID,
          refs: [{
            ref_name: "refs/heads/main",
            ref_type: "branch",
            commit_id: HEAD_COMMIT_ID,
          }, {
            ref_name: "refs/heads/project-setup",
            ref_type: "branch",
            commit_id: PARENT_COMMIT_ID,
          }],
          refs_included: true,
          snapshot_id: "a".repeat(64),
          next_cursor: null,
          has_more: false,
          total: 12,
          graph_health: "complete",
          unreadable_commit_ids: [],
        }}
        scopes={[{
          id: "scope-docs",
          project_id: "project-1",
          name: "Documentation",
          path: "docs",
          exclude: [],
          max_mode: "rw",
        }]}
        connectors={[{
          id: "notion-root",
          target: { kind: "project_root", project_id: "project-1" },
          provider: "notion",
          name: "Notion knowledge",
          direction: "inbound",
          status: "active",
        }, {
          id: "orphan-automation",
          target: { kind: "scope", project_id: "project-1", scope_id: "missing-scope" },
          provider: "google_docs",
          name: "Detached docs",
          direction: "inbound",
          status: "active",
        }]}
        mcpEndpoints={[{
          id: "mcp-docs",
          project_id: "project-1",
          path: "docs",
          name: "Docs MCP",
          status: "active",
          accesses: [{ path: "docs", readonly: true }],
        }]}
        identity={{
          project_id: "project-1",
          url: "https://cloud.example/git/project-1.git",
          scopes: [{
            id: "scope-docs",
            name: "Documentation",
            path: "docs",
            git_url: "https://cloud.example/git/project-1/scopes/scope-docs.git",
          }],
        }}
        loading={false}
        onSelectSection={onSelectSection}
        onRefresh={onRefresh}
      />,
    )));

    expect(container.querySelector(".desktop-cloud-overview-catalog")).not.toBeNull();
    const dashboard = container.querySelector(".desktop-cloud-overview-dashboard");
    const historyCard = dashboard?.querySelector(".desktop-cloud-overview-dashboard-card--history");
    const accessCard = dashboard?.querySelector(".desktop-cloud-overview-dashboard-card--access");
    const automationCard = dashboard?.querySelector(".desktop-cloud-overview-dashboard-card--automation");
    const storageCard = dashboard?.querySelector(".desktop-cloud-overview-dashboard-card--storage");
    expect(dashboard).not.toBeNull();
    expect(dashboard?.querySelectorAll(".desktop-cloud-overview-dashboard-card")).toHaveLength(4);
    expect(historyCard?.querySelector(".desktop-cloud-overview-dashboard-hero strong")?.textContent).toBe("2");
    expect(historyCard?.textContent).toContain("commits in the last 7 days");
    expect(historyCard?.textContent).not.toContain("Ada");
    expect(historyCard?.querySelector(".desktop-cloud-overview-history-preview-row")).toBeNull();
    expect(accessCard?.textContent).toContain("5");
    expect(accessCard?.textContent).toContain("access points");
    expect(accessCard?.querySelector(".desktop-cloud-overview-access-row")).toBeNull();
    expect(automationCard?.textContent).toContain("1");
    expect(automationCard?.textContent).toContain("active automation");
    expect(automationCard?.querySelector(".desktop-cloud-overview-automation-footer")).toBeNull();
    expect(storageCard?.textContent).toContain("5 files");
    expect(storageCard?.textContent).toContain("Stored in this project");
    expect(storageCard?.textContent).toContain("3");
    expect(storageCard?.textContent).toContain("folders");
    expect(storageCard?.querySelectorAll(".desktop-cloud-overview-storage-preview-item")).toHaveLength(8);
    expect(storageCard?.querySelectorAll(".desktop-cloud-overview-storage-preview-item--folder")).toHaveLength(3);
    expect(storageCard?.querySelectorAll(
      ".desktop-cloud-overview-storage-preview-item:not(.desktop-cloud-overview-storage-preview-item--folder)",
    )).toHaveLength(5);
    const dashboardCards = dashboard
      ? Array.from(dashboard.querySelectorAll(".desktop-cloud-overview-dashboard-card"))
      : [];
    expect(dashboardCards[0]).toBe(storageCard);
    expect(container.querySelector(".desktop-cloud-source-pill")).toBeNull();
    expect(container.querySelector(".desktop-cloud-overview-landing-mark")?.getAttribute("aria-label")).toBe("Cloud source");
    expect(container.querySelector(".desktop-cloud-overview-deployment-board")).toBeNull();
    const gitRemote = container.querySelector<HTMLElement>(".desktop-cloud-overview-git-remote code");
    expect(gitRemote?.textContent).toBe("https://cloud.example/git/project-1.git");
    expect(gitRemote?.title).toBe("https://cloud.example/git/project-1.git");
    expect(dashboard?.textContent).not.toContain("https://cloud.example/git/project-1.git");
    expect(dashboard?.textContent).not.toContain("release");
    expect(dashboard?.textContent).not.toContain("Private");
    expect(container.textContent).toContain("Shared product research");
    expect(findButton(container, "Open on web")).toBeUndefined();
    expect(container.querySelector(".desktop-project-folder-card")).toBeNull();

    act(() => findButton(container, "Refresh")?.click());
    expect(onRefresh).toHaveBeenCalledOnce();

    act(() => findButton(container, "View history")?.click());
    act(() => findButton(container, "Manage access points")?.click());
    act(() => findButton(container, "Manage automations")?.click());
    expect(onSelectSection.mock.calls).toEqual([["history"], ["access"], ["automation"]]);
  });
});

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.includes(label) || button.getAttribute("aria-label") === label);
}

const WORKSPACE = {
  id: "workspace-1",
  name: "Atlas",
  path: "/work/atlas",
  status: "protected",
} satisfies Workspace;

const HEAD_COMMIT_ID = "1".repeat(40);
const PARENT_COMMIT_ID = "2".repeat(40);

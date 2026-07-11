/**
 * @vitest-environment happy-dom
 */
import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopSidebarRailNavigation } from "../src/features/app-shell/navigation";
import {
  CloudProjectHistorySidebar,
  CloudProjectHistoryView,
} from "../src/features/cloud/CloudProjectHistory";
import { buildCloudBranchGraphRows } from "../src/features/cloud/model";
import type { DesktopCloudHistory } from "../src/lib/cloudApi";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Cloud project history", () => {
  it("replaces local Changes navigation with a History clock in Cloud projects", () => {
    const onNavigate = vi.fn();
    const container = render(
      <DesktopSidebarRailNavigation
        activeView="data"
        cloudHistoryEnabled
        cloudToolsEnabled={false}
        gitEnabled={false}
        pluginsEnabled={false}
        gitIncomingCount={0}
        gitOperationLoading={null}
        gitStatus={null}
        workspaceChangeCount={0}
        onNavigate={onNavigate}
        onOpenSettings={vi.fn()}
      />,
    );

    const historyButton = container.querySelector<HTMLButtonElement>('button[aria-label="History"]');
    expect(historyButton).not.toBeNull();
    expect(historyButton?.querySelector(".lucide-clock-3")).not.toBeNull();
    expect(container.querySelector('button[aria-label="Changes"]')).toBeNull();

    act(() => historyButton?.click());
    expect(onNavigate).toHaveBeenCalledWith("git");
  });

  it("keeps the full Cloud timeline instead of truncating it to the first 20 commits", () => {
    const history = createHistory(27);
    expect(buildCloudBranchGraphRows(null, history)).toHaveLength(27);
  });

  it("selects commits from the graph and shows author, time, SHA, and changed paths", () => {
    const history = createHistory(2);
    const rows = buildCloudBranchGraphRows(null, history);
    const container = render(<HistoryHarness history={history} />);

    expect(container.querySelector('[role="listbox"][aria-label="Commit history"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(container.querySelector(".desktop-cloud-history-graph-svg")).not.toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Commit 1");
    expect(container.textContent).toContain("Author 1");
    expect(container.textContent).toContain("src/file-1.ts");
    expect(container.textContent).toContain("HEAD");

    const olderCommit = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .find((button) => button.textContent?.includes("Commit 2"));
    if (!olderCommit) throw new Error("Older commit row is missing.");

    act(() => olderCommit.click());

    expect(container.querySelector("h1")?.textContent).toBe("Commit 2");
    expect(container.textContent).toContain("Author 2");
    expect(container.textContent).toContain("src/file-2.ts");
    expect(container.querySelector('.desktop-cloud-commit-file-row[data-change-kind="deleted"]')).not.toBeNull();
  });
});

function HistoryHarness({ history }: { history: DesktopCloudHistory }) {
  const rows = buildCloudBranchGraphRows(null, history);
  const [selectedCommitId, setSelectedCommitId] = useState(history.head_commit_id ?? rows[0]?.id ?? null);
  const sharedProps = {
    rows,
    selectedCommitId,
    loading: false,
    error: null,
    onSelectCommit: setSelectedCommitId,
    onRefresh: vi.fn(),
  };

  return (
    <div>
      <CloudProjectHistorySidebar {...sharedProps} />
      <CloudProjectHistoryView
        {...sharedProps}
        projectId="project-1"
        projectName="Cloud Atlas"
        history={history}
      />
    </div>
  );
}

function render(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

function createHistory(count: number): DesktopCloudHistory {
  const commits = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const deleted = number % 2 === 0;
    return {
      commit_id: number.toString(16).padStart(40, String(number % 10)),
      who: `Author ${number}`,
      message: `Commit ${number}`,
      created_at: `2026-07-${String(Math.max(1, 11 - index)).padStart(2, "0")}T10:00:00.000Z`,
      changes: [{
        path: `src/file-${number}.ts`,
        action: deleted ? "delete" as const : "update" as const,
        op: deleted ? "deleted" as const : "modified" as const,
      }],
      root_hash: `root-${number}`,
    };
  });
  return {
    project_id: "project-1",
    commits,
    head_commit_id: commits[0]?.commit_id ?? null,
  };
}

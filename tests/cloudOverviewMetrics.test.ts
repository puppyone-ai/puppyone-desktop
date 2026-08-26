import { describe, expect, it } from "vitest";
import type { DesktopCloudDashboard, DesktopCloudTree } from "../src/lib/cloudApi";
import {
  getCloudOverviewRootEntries,
  getCloudOverviewStorageUsage,
} from "../src/features/cloud/sections/overview/overviewMetrics";

describe("Cloud Overview metrics", () => {
  it("keeps only direct children and orders product folders before files", () => {
    const tree: DesktopCloudTree = {
      path: "docs",
      entries: [{
        name: "zeta.md",
        path: "docs/zeta.md",
        type: "markdown",
      }, {
        name: "assets",
        path: "docs/assets",
        type: "folder",
      }, {
        name: "nested.md",
        path: "docs/assets/nested.md",
        type: "markdown",
      }],
    };

    expect(getCloudOverviewRootEntries(tree).map((entry) => entry.name)).toEqual([
      "assets",
      "zeta.md",
    ]);
  });

  it("uses authoritative project storage and quota when the dashboard provides them", () => {
    expect(getCloudOverviewStorageUsage(createDashboard({
      storage_bytes: 125,
      storage_limit_bytes: 500,
    }), null)).toEqual({
      bytes: 125,
      limitBytes: 500,
      percent: 25,
      isLowerBound: false,
    });
  });

  it("marks a root-tree storage sum as a lower bound when folders can contain more data", () => {
    const usage = getCloudOverviewStorageUsage(null, {
      path: "",
      entries: [{ name: "docs", path: "docs", type: "folder" }, {
        name: "README.md",
        path: "README.md",
        type: "markdown",
        size_bytes: 256,
      }],
    });

    expect(usage).toEqual({
      bytes: 256,
      limitBytes: null,
      percent: null,
      isLowerBound: true,
    });
  });

  it("does not invent storage usage when the tree contains no measurable files", () => {
    expect(getCloudOverviewStorageUsage(null, {
      path: "",
      entries: [{ name: "docs", path: "docs", type: "folder" }],
    }).bytes).toBeNull();
  });
});

function createDashboard(nodes: Partial<DesktopCloudDashboard["nodes"]>): DesktopCloudDashboard {
  return {
    project: { id: "project-1", name: "Atlas" },
    nodes: { total: 0, folders: 0, files: 0, ...nodes },
    connections: [],
    tools: [],
    uploads: [],
  };
}

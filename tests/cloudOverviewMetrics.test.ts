import { describe, expect, it } from "vitest";
import type { DesktopCloudDashboard, DesktopCloudTree } from "../src/lib/cloudApi";
import {
  getCloudOverviewRootEntries,
  getCloudOverviewStorageUsage,
} from "../src/features/cloud/sections/overview/overviewMetrics";

describe("Cloud Overview storage usage", () => {
  it("prefers the complete project total supplied by the dashboard", () => {
    expect(getCloudOverviewStorageUsage(dashboard(4096), tree())).toEqual({
      bytes: 4096,
      limitBytes: null,
      percent: null,
      isLowerBound: false,
    });
  });

  it("marks totals as a lower bound when some project files are omitted", () => {
    expect(getCloudOverviewStorageUsage(dashboard(), tree())).toEqual({
      bytes: 3072,
      limitBytes: null,
      percent: null,
      isLowerBound: true,
    });
  });

  it("keeps nested files in storage totals but out of the root file list", () => {
    const fullTree = tree();
    fullTree.entries.push({
      name: "guide.md",
      path: "docs/guide.md",
      type: "markdown",
      size_bytes: 1024,
    });

    expect(getCloudOverviewStorageUsage(dashboard(), fullTree)).toEqual({
      bytes: 4096,
      limitBytes: null,
      percent: null,
      isLowerBound: false,
    });
    expect(getCloudOverviewRootEntries(fullTree).map((entry) => entry.path)).toEqual([
      "docs",
      "README.md",
      "package.json",
    ]);
  });

  it("calculates a project-limit percentage only when Cloud supplies the limit", () => {
    const value = dashboard(4096);
    value.nodes.storage_limit_bytes = 16384;
    expect(getCloudOverviewStorageUsage(value, tree())).toMatchObject({
      bytes: 4096,
      limitBytes: 16384,
      percent: 25,
    });
  });
});

function dashboard(storageBytes?: number): DesktopCloudDashboard {
  return {
    project: { id: "project-1", name: "Atlas" },
    nodes: {
      total: 4,
      folders: 1,
      files: 3,
      storage_bytes: storageBytes,
    },
    connections: [],
    tools: [],
    uploads: [],
  };
}

function tree(): DesktopCloudTree {
  return {
    path: "",
    entries: [{
      name: "docs",
      path: "docs",
      type: "folder",
    }, {
      name: "README.md",
      path: "README.md",
      type: "markdown",
      size_bytes: 2048,
    }, {
      name: "package.json",
      path: "package.json",
      type: "json",
      size_bytes: 1024,
    }],
  };
}

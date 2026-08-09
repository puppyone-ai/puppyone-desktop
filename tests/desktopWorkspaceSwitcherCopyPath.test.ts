import { describe, expect, it } from "vitest";
import {
  getProjectCopyPath,
  type DesktopWorkspaceSwitcherItem,
} from "../src/features/app-shell/DesktopWorkspaceSwitcher";
import { getWorkspaceParentPathForDisplay } from "../src/features/app-shell/workspaceHomeModel";

describe("desktop workspace switcher copy path", () => {
  it("copies the filesystem root for local projects", () => {
    expect(getProjectCopyPath(createItem({
      detail: "/Users/example/Desktop/demo",
      path: "/Users/example/Desktop/demo",
    }))).toBe("/Users/example/Desktop/demo");
  });

  it("skips an item without a filesystem root", () => {
    expect(getProjectCopyPath(createItem({
      detail: "Unavailable",
      path: "",
    }))).toBeNull();
  });

  it("copies every registered local workspace root", () => {
    expect(getProjectCopyPath(createItem({
      detail: "/Users/example/Library/Caches/puppyone/demo",
      path: "/Users/example/Library/Caches/puppyone/demo",
    }))).toBe("/Users/example/Library/Caches/puppyone/demo");
  });
});

describe("desktop workspace switcher display path", () => {
  it("shows the home-relative parent without repeating the project name", () => {
    expect(getWorkspaceParentPathForDisplay("/Users/example/Desktop/puppyone desktop"))
      .toBe("~/Desktop");
  });

  it("keeps non-home parent paths canonical", () => {
    expect(getWorkspaceParentPathForDisplay("/private/tmp/puppyone-project"))
      .toBe("/private/tmp");
  });

  it("handles trailing separators and filesystem roots", () => {
    expect(getWorkspaceParentPathForDisplay("/Users/example/Documents/demo/"))
      .toBe("~/Documents");
    expect(getWorkspaceParentPathForDisplay("/workspace"))
      .toBe("/");
  });
});

function createItem({
  detail,
  path,
}: {
  detail: string;
  path: string;
}): DesktopWorkspaceSwitcherItem {
  return {
    id: "workspace-1",
    label: "demo",
    detail,
    title: `demo - ${detail}`,
    workspace: {
      id: "workspace-1",
      name: "demo",
      path,
    },
  };
}

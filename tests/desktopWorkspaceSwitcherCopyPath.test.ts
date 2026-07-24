import { describe, expect, it } from "vitest";
import {
  getProjectCopyPath,
  type DesktopWorkspaceSwitcherItem,
} from "../src/features/app-shell/DesktopWorkspaceSwitcher";

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

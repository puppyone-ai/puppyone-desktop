import { describe, expect, it } from "vitest";
import {
  getProjectCopyPath,
  type DesktopWorkspaceSwitcherItem,
} from "../src/features/app-shell/DesktopWorkspaceSwitcher";

describe("desktop workspace switcher copy path", () => {
  it("copies the filesystem root for local projects", () => {
    expect(getProjectCopyPath(createItem({
      kind: "local",
      detail: "/Users/supersayajin/Desktop/demo",
      path: "/Users/supersayajin/Desktop/demo",
    }))).toBe("/Users/supersayajin/Desktop/demo");
  });

  it("skips cloud status labels that are not filesystem paths", () => {
    expect(getProjectCopyPath(createItem({
      kind: "cloud",
      detail: "PuppyOne Cloud",
      path: "PuppyOne Cloud",
    }))).toBeNull();
  });

  it("still copies cloud workspaces that have a real local root", () => {
    expect(getProjectCopyPath(createItem({
      kind: "cloud",
      detail: "PuppyOne Cloud",
      path: "/Users/supersayajin/Library/Caches/puppyone/demo",
    }))).toBe("/Users/supersayajin/Library/Caches/puppyone/demo");
  });
});

function createItem({
  kind,
  detail,
  path,
}: {
  kind: DesktopWorkspaceSwitcherItem["kind"];
  detail: string;
  path: string;
}): DesktopWorkspaceSwitcherItem {
  return {
    id: "workspace-1",
    kind,
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

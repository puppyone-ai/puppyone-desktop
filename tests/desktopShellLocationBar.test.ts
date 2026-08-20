import { describe, expect, it } from "vitest";
import {
  resolveDesktopShellLocationPath,
  resolveDesktopShellWorkspaceEntryPath,
} from "../src/features/app-shell/DesktopShellLocationBar";

describe("desktop Shell location bar", () => {
  it("shows the selected folder while the Files view is active", () => {
    expect(resolveDesktopShellLocationPath({
      activePath: "/Users/demo/PuppyOne/document",
      activePathIsFolder: true,
      dataViewActive: true,
      workspacePath: "/Users/demo/PuppyOne",
    })).toBe("/Users/demo/PuppyOne/document");
  });

  it("shows a selected file's containing folder", () => {
    expect(resolveDesktopShellLocationPath({
      activePath: "/Users/demo/PuppyOne/document/README.md",
      activePathIsFolder: false,
      dataViewActive: true,
      workspacePath: "/Users/demo/PuppyOne",
    })).toBe("/Users/demo/PuppyOne/document");
  });

  it("falls back to the workspace outside Files or for an unrelated path", () => {
    expect(resolveDesktopShellLocationPath({
      activePath: "/Users/demo/Other/file.md",
      activePathIsFolder: false,
      dataViewActive: true,
      workspacePath: "/Users/demo/PuppyOne/",
    })).toBe("/Users/demo/PuppyOne");
    expect(resolveDesktopShellLocationPath({
      activePath: "C:\\PuppyOne\\document\\README.md",
      activePathIsFolder: false,
      dataViewActive: false,
      workspacePath: "C:\\PuppyOne\\",
    })).toBe("C:\\PuppyOne");
  });

  it("turns relative explorer paths into a full address without leaving the workspace", () => {
    expect(resolveDesktopShellLocationPath({
      activePath: "document/README.md",
      activePathIsFolder: false,
      dataViewActive: true,
      workspacePath: "/Users/demo/PuppyOne",
    })).toBe("/Users/demo/PuppyOne/document");
    expect(resolveDesktopShellLocationPath({
      activePath: "README.md",
      activePathIsFolder: false,
      dataViewActive: true,
      workspacePath: "/Users/demo/PuppyOne",
    })).toBe("/Users/demo/PuppyOne");
  });

  it("maps entered addresses back to workspace-scoped entry paths", () => {
    expect(resolveDesktopShellWorkspaceEntryPath(
      "/Users/demo/PuppyOne/document",
      "/Users/demo/PuppyOne",
    )).toBe("document");
    expect(resolveDesktopShellWorkspaceEntryPath(
      "/Users/demo/PuppyOne",
      "/Users/demo/PuppyOne",
    )).toBeNull();
    expect(resolveDesktopShellWorkspaceEntryPath(
      "/Users/demo/Other",
      "/Users/demo/PuppyOne",
    )).toBeUndefined();
    expect(resolveDesktopShellWorkspaceEntryPath(
      "../Other",
      "/Users/demo/PuppyOne",
    )).toBeUndefined();
  });
});

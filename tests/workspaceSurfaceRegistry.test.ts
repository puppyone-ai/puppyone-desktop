import { describe, expect, it } from "vitest";
import {
  getAvailableWorkspaceSurfaces,
  resolveWorkspaceSurface,
  resolveWorkspaceSurfaceContribution,
  type WorkspaceSurfaceCapabilities,
  type WorkspaceSurfaceAdapters,
  type WorkspaceSurfaceContent,
  type WorkspaceSurfaceId,
} from "../src/features/app-shell/workspace-surfaces";

const localCapabilities: WorkspaceSurfaceCapabilities = {
  workspaceKind: "local",
  cloudEnabled: true,
  cloudProjectAvailable: false,
  pluginsEnabled: false,
};

describe("Workspace Surface Registry", () => {
  it("derives navigation and route availability from the same capability result", () => {
    expect(getAvailableWorkspaceSurfaces(localCapabilities).map(({ id }) => id)).toEqual([
      "data",
      "git",
      "cloud",
      "settings",
    ]);

    const cloudCapabilities: WorkspaceSurfaceCapabilities = {
      workspaceKind: "cloud",
      cloudEnabled: true,
      cloudProjectAvailable: true,
      pluginsEnabled: false,
    };
    expect(getAvailableWorkspaceSurfaces(cloudCapabilities).map(({ id }) => id)).toEqual([
      "data",
      "git",
      "access",
      "automation",
      "settings",
    ]);
  });

  it("falls back unavailable routes to Data without producing a second content instance", () => {
    const content = createContent();
    const resolved = resolveWorkspaceSurface({
      capabilities: localCapabilities,
      adapters: createAdapters(content),
      requestedId: "automation",
    });

    expect(resolved.id).toBe("data");
    expect(resolved.content).toBe(content.data);
    expect(resolved.lifecycle).toEqual({ sidebar: "keep-alive", main: "keep-alive" });
    expect(resolveWorkspaceSurfaceContribution("automation", localCapabilities).id).toBe("data");
  });

  it("returns one resolved instance that owns both Sidebar and Main content", () => {
    const content = createContent();
    const resolved = resolveWorkspaceSurface({
      capabilities: localCapabilities,
      adapters: createAdapters(content),
      requestedId: "git",
    });

    expect(resolved.id).toBe("git");
    expect(resolved.content).toBe(content.git);
    expect(resolved.content.sidebar).toBe("git-sidebar");
    expect(resolved.content.main).toBe("git-main");
  });
});

function createContent(): Readonly<Record<WorkspaceSurfaceId, WorkspaceSurfaceContent>> {
  return {
    data: { sidebar: "data-sidebar", main: "data-main" },
    git: { sidebar: "git-sidebar", main: "git-main" },
    plugins: { sidebar: "plugins-sidebar", main: "plugins-main" },
    cloud: { sidebar: "cloud-sidebar", main: "cloud-main" },
    access: { sidebar: "access-sidebar", main: "access-main" },
    automation: { sidebar: "automation-sidebar", main: "automation-main" },
    settings: { sidebar: "settings-sidebar", main: "settings-main" },
  };
}

function createAdapters(
  content: Readonly<Record<WorkspaceSurfaceId, WorkspaceSurfaceContent>>,
): WorkspaceSurfaceAdapters {
  return {
    data: () => content.data,
    git: () => content.git,
    plugins: () => content.plugins,
    cloud: () => content.cloud,
    access: () => content.access,
    automation: () => content.automation,
    settings: () => content.settings,
  };
}

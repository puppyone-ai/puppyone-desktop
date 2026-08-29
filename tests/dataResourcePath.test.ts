import { describe, expect, it } from "vitest";
import {
  collectDataResourceAncestors,
  createWorkspaceResourceUri,
  createWorkspaceRootUri,
  getDataResourceName,
  getDataResourceParent,
  isDataResourceDescendant,
  isSameDataResource,
  joinDataResourcePath,
  normalizeDataResourcePath,
  rebaseDataResourcePath,
} from "../packages/shared-ui/src";

describe("data Resource path operations", () => {
  it("preserves Resource URI identity across navigation operations", () => {
    const root = createWorkspaceRootUri("folder-a");
    const src = createWorkspaceResourceUri(root, "src");
    const file = createWorkspaceResourceUri(root, "src/App.tsx");

    expect(normalizeDataResourcePath(file)).toBe(file);
    expect(getDataResourceName(file)).toBe("App.tsx");
    expect(getDataResourceParent(file)).toBe(src);
    expect(joinDataResourcePath(src, "App.tsx")).toBe(file);
    expect(collectDataResourceAncestors(file)).toEqual([root, src]);
    expect(isDataResourceDescendant(file, root)).toBe(true);
    expect(isSameDataResource(file, createWorkspaceResourceUri(root, "src/./App.tsx"))).toBe(true);
  });

  it("does not expose a parent above a Workspace Folder root", () => {
    const root = createWorkspaceRootUri("folder-a");
    expect(getDataResourceParent(root)).toBeNull();
    expect(collectDataResourceAncestors(root)).toEqual([]);
  });

  it("keeps equal provider paths isolated by Folder URI", () => {
    const first = createWorkspaceResourceUri(createWorkspaceRootUri("folder-a"), "README.md");
    const second = createWorkspaceResourceUri(createWorkspaceRootUri("folder-b"), "README.md");

    expect(isSameDataResource(first, second)).toBe(false);
    expect(isDataResourceDescendant(first, createWorkspaceRootUri("folder-b"))).toBe(false);
  });

  it("rebases descendants without crossing Workspace Folders", () => {
    const root = createWorkspaceRootUri("folder-a");
    const before = createWorkspaceResourceUri(root, "docs");
    const after = createWorkspaceResourceUri(root, "notes");
    const child = createWorkspaceResourceUri(root, "docs/guide.md");

    expect(rebaseDataResourcePath(child, before, after)).toBe(
      createWorkspaceResourceUri(root, "notes/guide.md"),
    );
  });

  it("retains legacy relative path behavior", () => {
    expect(normalizeDataResourcePath("./src//App.tsx")).toBe("src/App.tsx");
    expect(getDataResourceParent("src/App.tsx")).toBe("src");
    expect(joinDataResourcePath("src", "App.tsx")).toBe("src/App.tsx");
    expect(collectDataResourceAncestors("src/components/App.tsx")).toEqual(["src", "src/components"]);
  });
});

import { describe, expect, it } from "vitest";
import { resolveRendererPublicAssetUrl } from "@puppyone/shared-ui";

describe("renderer public asset URLs", () => {
  it("keeps assets relative to Electron's packaged renderer document", () => {
    const source = resolveRendererPublicAssetUrl("icons/agent-codex-light.png", "./");

    expect(source).toBe("./icons/agent-codex-light.png");
    expect(new URL(
      source,
      "file:///Applications/PuppyOne.app/Contents/Resources/app.asar/dist/index.html",
    ).href).toBe(
      "file:///Applications/PuppyOne.app/Contents/Resources/app.asar/dist/icons/agent-codex-light.png",
    );
  });

  it("supports development and nested deployment bases", () => {
    expect(resolveRendererPublicAssetUrl("icons/folder.svg", "/"))
      .toBe("/icons/folder.svg");
    expect(resolveRendererPublicAssetUrl("icons/folder.svg", "/desktop/"))
      .toBe("/desktop/icons/folder.svg");
  });

  it.each([
    "/icons/folder.svg",
    "../icons/folder.svg",
    "icons/../folder.svg",
    "icons\\folder.svg",
    "https://example.com/icon.svg",
    "icons/folder.svg?theme=dark",
    "icons/folder.svg#mark",
  ])("rejects an unsafe public asset path: %s", (assetPath) => {
    expect(() => resolveRendererPublicAssetUrl(assetPath, "./")).toThrow(
      "Renderer public asset paths must be safe repository-relative paths",
    );
  });
});

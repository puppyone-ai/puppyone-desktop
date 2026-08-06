import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const desktopDataSurface = read("../src/features/app-shell/DesktopDataWorkspaceSurface.tsx");
const textEditorFrame = read("../packages/shared-ui/src/editor/viewers/TextEditorFrame.tsx");

describe("Desktop editor architecture", () => {
  it("exposes the shared Live View and Source Code switch in the Desktop workspace", () => {
    expect(desktopDataSurface).not.toContain("hidePreviewSourceView");
    expect(textEditorFrame).toContain('switchMode("live")');
    expect(textEditorFrame).toContain('switchMode("source")');
    expect(textEditorFrame).toContain('t("editor.mode.live")');
    expect(textEditorFrame).toContain('t("editor.mode.source")');
  });
});

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

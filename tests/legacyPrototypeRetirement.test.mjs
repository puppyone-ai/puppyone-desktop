import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const retiredPaths = [
  "src/ai-edits/mockAiEdits.ts",
  "src/components/ChangesWorkspace.tsx",
  "src/components/CloudSidebar.tsx",
  "src/components/DesktopUtilityViews.tsx",
  "src/features/cloud/hooks/useDesktopCloudData.ts",
  "src/features/cloud/legacy-sidebar.css",
  "src/lib/mockData.ts",
  "src/screens/Onboarding.tsx",
  "src/screens/Receipt.tsx",
  "src/screens/Recording.tsx",
  "src/screens/Review.tsx",
  "src/screens/WorkspaceHome.tsx",
  "public/old-vs-new-world.png",
];

describe("retired prototype boundary", () => {
  it("does not retain the disconnected mock workspace or legacy Cloud sidebar", () => {
    for (const relativePath of retiredPaths) {
      expect(existsSync(path.join(root, relativePath)), relativePath).toBe(false);
    }
  });

  it("does not load retired styles into the production renderer", () => {
    const styles = readFileSync(path.join(root, "src/styles.css"), "utf8");
    expect(styles).not.toContain("legacy-sidebar.css");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sharedShell = readSource("../src/features/cloud/styles/sidebar-shell.css");
const overview = readSource("../src/features/cloud/sections/overview/styles/base.css");
const connections = readSource("../src/features/cloud/access-points/styles/catalog-page.css");
const settings = readSource("../src/features/cloud/sections/settings/settings.css");
const automation = readSource("../src/features/automation/styles/shell-and-catalog.css");
const activation = readSource("../src/features/cloud/components/mcp-activation.css");

describe("Cloud content width architecture", () => {
  it("shares the editor-scale 900px reading rail across project pages", () => {
    expect(sharedShell).toContain("--desktop-cloud-content-max-width: 900px;");
    expect(sharedShell).toContain("width: min(100%, var(--desktop-cloud-content-max-width));");

    const constrainedWidth = "width: min(100%, var(--desktop-cloud-content-max-width, 900px));";
    for (const stylesheet of [overview, connections, settings, automation, activation]) {
      expect(stylesheet).toContain(constrainedWidth);
      expect(stylesheet).not.toContain("width: min(100%, 1760px);");
    }
  });
});

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

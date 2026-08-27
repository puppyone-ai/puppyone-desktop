import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sharedShell = readSource("../src/features/cloud/styles/sidebar-shell.css");
const overview = readSource("../src/features/cloud/sections/overview/styles/base.css");
const connections = readSource("../src/features/cloud/access-points/styles/catalog-page.css");
const settings = readSource("../src/features/cloud/sections/settings/settings.css");
const automation = readSource("../src/features/automation/styles/shell-and-catalog.css");
const activation = readSource("../src/features/cloud/components/mcp-activation.css");
const cloudSignIn = readSource("../src/features/cloud/auth/cloud-sign-in.css");
const organization = readSource("../src/features/cloud/organization/organization.css");

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

  it("derives every Cloud catalog top inset from the Team and Billing shell rhythm", () => {
    expect(sharedShell).toContain("--desktop-cloud-shell-padding-top: var(--desktop-utility-page-padding-top);");
    expect(sharedShell).toContain("--desktop-cloud-catalog-padding-top: 44px;");
    expect(sharedShell).toContain("--desktop-cloud-page-padding-top: calc(");

    const alignedPadding = [
      "var(--desktop-cloud-page-padding-top)",
      "var(--desktop-cloud-page-padding-inline)",
      "var(--desktop-cloud-page-padding-bottom)",
    ].join("\n    ");
    for (const stylesheet of [overview, connections, settings, automation]) {
      expect(stylesheet).toContain(alignedPadding);
      expect(stylesheet).not.toContain("padding: 44px clamp(28px, 4.6vw, 44px) 56px;");
    }

    expect(organization).toContain("var(--desktop-cloud-catalog-padding-top)");
    expect(sharedShell).toContain(":not(.desktop-cloud-landing-main-view):not(.desktop-cloud-automation-main-view)");
  });

  it("keeps activation copy and artwork compact and responds to the content pane", () => {
    expect(cloudSignIn).toContain("container: cloud-auth / inline-size;");
    expect(activation).toContain(".desktop-cloud-mcp-activation.is-connection");
    expect(activation).toContain("grid-template-columns: minmax(320px, 360px) 220px;");
    expect(activation).toContain("gap: 44px;");
    expect(activation).toContain("@container (max-width: 820px)");
    expect(activation).toContain("@container (max-width: 680px)");
    expect(activation).toContain("@container (max-width: 420px)");
    expect(activation).toContain(".desktop-cloud-activation-illustration-frame.is-connection");
    expect(activation).toContain("--desktop-cloud-connection-art-scale: 0.46;");
    expect(activation).toContain("width: 84px;");
    expect(activation).toContain("height: 196px;");
    expect(activation).toContain("transform: scale(var(--desktop-cloud-connection-art-scale));");
    expect(activation).toContain(".desktop-cloud-activation-illustration-frame.is-overview");
    expect(activation).toContain("height: 190px;");
    expect(activation).not.toContain("desktop-cloud-activation-overview-link");
    expect(activation).not.toContain("@media (max-width: 760px)");
    expect(activation).not.toContain("margin-bottom: -");
  });
});

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

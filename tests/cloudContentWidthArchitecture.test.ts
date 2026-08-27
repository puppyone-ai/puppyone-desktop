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
    expect(activation).toContain("--desktop-cloud-activation-max-width: 760px;");
    expect(activation).toContain("--desktop-cloud-activation-artwork-slot-size: 240px;");
    expect(activation).toContain("max-width: var(--desktop-cloud-activation-max-width);");
    expect(activation).toContain("grid-template-columns: minmax(0, 360px) var(--desktop-cloud-activation-artwork-slot-size);");
    expect(activation).toContain("gap: 44px;");
    expect(activation).toContain("@container (max-width: 820px)");
    expect(activation).toContain("@container (max-width: 680px)");
    expect(activation).toContain("@container (max-width: 420px)");
    expect(activation).toContain(".desktop-cloud-activation-illustration-frame.is-connection");
    expect(activation).toContain("--desktop-cloud-connection-art-scale: 0.58;");
    expect(activation).toContain("--desktop-cloud-overview-art-scale: 1;");
    expect(activation).toContain("--desktop-cloud-secondary-art-scale: 0.52;");
    expect(activation).toContain("--desktop-cloud-activation-artwork-slot-size: 210px;");
    expect(activation).toContain("--desktop-cloud-connection-art-scale: 0.51;");
    expect(activation).toContain("aspect-ratio: 1;");
    expect(activation).toContain("overflow: hidden;");
    expect(activation).toContain("contain: layout paint;");
    expect(activation).toContain("justify-self: end;");
    expect(activation).toContain("position: absolute;");
    expect(activation).toContain("left: 50%;");
    expect(activation).toContain("top: 50%;");
    expect(activation).toContain("transform: translate(-50%, -50%) scale(var(--desktop-cloud-connection-art-scale));");
    expect(activation).toContain("grid-template-columns: 166px 54px 166px;");
    expect(activation).toContain("grid-template-columns: 166px 54px 176px;");
    expect(activation).toContain("background: linear-gradient(to right, #d8d8d5 0%, #c9c9c6 78%, #bdbdb9 100%);");
    expect(activation).not.toContain("grid-template-rows: 146px 54px 226px;");
    expect(activation).toContain(".desktop-cloud-activation-illustration-frame.is-overview");
    expect(activation).toContain("width: var(--desktop-cloud-activation-artwork-slot-size);");
    expect(activation).toContain("height: auto;");
    expect(activation).toContain("isolation: isolate;");
    expect(activation).toContain("filter: drop-shadow(0 11px 17px rgba(79, 76, 68, 0.16));");
    expect(activation).toContain("inset-inline-end: 6px;");
    expect(activation).toContain("inset-inline-start: 4px;");
    expect(activation).not.toContain("desktop-cloud-activation-overview-link");
    expect(activation).not.toContain("grid-template-columns: minmax(0, 1fr) var(--desktop-cloud-activation-artwork-slot-size);");
    expect(activation).not.toContain("grid-template-columns: minmax(0, 430px);");
    expect(activation).not.toContain("justify-items: center;");
    expect(activation).not.toMatch(/\.desktop-cloud-activation-illustration-frame\s*\{[^}]*place-items:/s);
    expect(activation).not.toContain("@media (max-width: 760px)");
    expect(activation).not.toContain("margin-bottom: -");
  });
});

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

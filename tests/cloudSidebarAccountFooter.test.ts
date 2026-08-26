import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(
  new URL("../src/features/cloud/CloudServiceSidebar.tsx", import.meta.url),
  "utf8",
);
const sidebarCss = readFileSync(
  new URL("../src/features/cloud/styles/sidebar-shell.css", import.meta.url),
  "utf8",
);
const workspaceSurfaceSource = readFileSync(
  new URL("../src/features/app-shell/workspace-surfaces/useWorkspaceSurfaceContent.tsx", import.meta.url),
  "utf8",
);

describe("Cloud account footer architecture", () => {
  it("presents the signed-in identity as an actionable application account row", () => {
    expect(sidebarSource).toContain('className="desktop-cloud-sidebar-account"');
    expect(sidebarSource).toContain("formatSidebarAccount(accountEmail, t)");
    expect(sidebarSource).toContain("onClick={onOpenAccount}");
    expect(sidebarSource).toContain('t("cloud.common.account")');
    expect(sidebarSource).not.toContain('role="img"');
  });

  it("routes the global account affordance to Account Settings", () => {
    expect(workspaceSurfaceSource).toContain('onSelectSettingsSection("account")');
    expect(workspaceSurfaceSource).toContain('onNavigate("settings")');
  });

  it("uses shared sidebar tokens instead of a floating avatar treatment", () => {
    expect(sidebarCss).toContain("border-top: 1px solid var(--po-sidebar-divider, var(--po-divider));");
    expect(sidebarCss).toContain("border-radius: var(--desktop-sidebar-row-radius);");
    expect(sidebarCss).toContain("background: var(--po-hover);");
    expect(sidebarCss).toContain("font-weight: var(--desktop-sidebar-font-weight");
    expect(sidebarCss).not.toContain("font-weight: 700;");
    expect(sidebarCss).not.toContain("box-shadow: 0 0 0 2px");
  });
});

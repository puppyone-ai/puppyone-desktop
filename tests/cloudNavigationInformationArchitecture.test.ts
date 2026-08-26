import { describe, expect, it } from "vitest";
import {
  CLOUD_PROJECT_SIDEBAR_ROUTES,
  getCloudRoute,
  getCloudSidebarActiveSection,
} from "../src/features/cloud/routes/cloudRoutes";
import { McpLogoIcon } from "../src/features/cloud/components/McpLogoIcon";

describe("Cloud navigation information architecture", () => {
  it("keeps Project work separate from the three first-class Connections", () => {
    expect(CLOUD_PROJECT_SIDEBAR_ROUTES.map((route) => route.id)).toEqual([
      "contents",
      "history",
      "automation",
      "mcp",
      "cli",
      "git-sync",
    ]);
    expect(getCloudRoute("mcp").icon).toBe(McpLogoIcon);
    expect(getCloudRoute("mcp").navigationGroup).toBe("connections");
    expect(getCloudRoute("cli").navigationGroup).toBe("connections");
    expect(getCloudRoute("git-sync").navigationGroup).toBe("connections");
    expect(getCloudRoute("access").showInSidebar).toBe(false);
    expect(getCloudRoute("history").showInSidebar).toBe(true);
    expect(getCloudRoute("history").navigationGroup).toBe("project");
    expect(getCloudRoute("settings").showInSidebar).toBe(false);
  });

  it("keeps History first-class while Settings remains a Homepage drill-down", () => {
    expect(getCloudSidebarActiveSection("history")).toBe("history");
    expect(getCloudSidebarActiveSection("settings")).toBe("contents");
    expect(getCloudRoute("history").surface).toBe("history");
    expect(getCloudRoute("settings").surface).toBe("landing");
  });
});

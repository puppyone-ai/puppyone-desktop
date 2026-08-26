import { describe, expect, it } from "vitest";
import {
  CLOUD_PROJECT_SIDEBAR_ROUTES,
  getCloudRoute,
  getCloudSidebarActiveSection,
} from "../src/features/cloud/routes/cloudRoutes";

describe("Cloud navigation information architecture", () => {
  it("keeps only the four primary Project capabilities in navigation", () => {
    expect(CLOUD_PROJECT_SIDEBAR_ROUTES.map((route) => route.id)).toEqual([
      "mcp-cli",
      "automation",
      "contents",
      "access",
    ]);
    expect(getCloudRoute("history").showInSidebar).toBe(false);
    expect(getCloudRoute("settings").showInSidebar).toBe(false);
  });

  it("treats History and Settings as Overview drill-downs without removing their routes", () => {
    expect(getCloudSidebarActiveSection("history")).toBe("contents");
    expect(getCloudSidebarActiveSection("settings")).toBe("contents");
    expect(getCloudRoute("history").surface).toBe("history");
    expect(getCloudRoute("settings").surface).toBe("landing");
  });
});

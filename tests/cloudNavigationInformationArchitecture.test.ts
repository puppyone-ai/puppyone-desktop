import { describe, expect, it } from "vitest";
import {
  CLOUD_PROJECT_SIDEBAR_ROUTES,
  getCloudRoute,
  getCloudSidebarActiveSection,
} from "../src/features/cloud/routes/cloudRoutes";

describe("Cloud navigation information architecture", () => {
  it("keeps Overview first, MCP second, and History out of primary navigation", () => {
    expect(CLOUD_PROJECT_SIDEBAR_ROUTES.map((route) => route.id)).toEqual([
      "contents",
      "mcp-cli",
      "automation",
      "access",
      "settings",
    ]);
    expect(getCloudRoute("history").showInSidebar).toBe(false);
  });

  it("treats History as an Overview drill-down without removing its route", () => {
    expect(getCloudSidebarActiveSection("history")).toBe("contents");
    expect(getCloudRoute("history").surface).toBe("history");
  });
});

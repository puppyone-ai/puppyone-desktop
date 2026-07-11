import { describe, expect, it } from "vitest";
import type { DesktopCloudAutomationProviderSpec } from "../src/lib/cloudApi";
import {
  buildDesktopCreateAutomationRequest,
  getDefaultAutomationRunMode,
  getSupportedAutomationRunModes,
} from "../src/features/automation/automationRequest";
import {
  buildAutomationTemplates,
  getAutomationTemplatesForCategory,
} from "../src/features/automation/automationTemplates";

describe("Automation creation flow", () => {
  it("only publishes templates backed by currently available Cloud providers", () => {
    const providers = [
      provider("gmail", "Gmail"),
      provider("google_docs", "Google Docs"),
      provider("google_sheets", "Google Sheets"),
      provider("url", "Web Page", "none"),
    ];

    const templates = buildAutomationTemplates(providers);
    expect(templates.map((template) => template.provider)).toEqual([
      "google_docs",
      "google_sheets",
      "gmail",
      "url",
    ]);
    expect(templates.some((template) => template.provider === "notion")).toBe(false);
    expect(getAutomationTemplatesForCategory(templates, "popular")).toHaveLength(4);
  });

  it("carries destination and schedule settings into the Cloud creation request", () => {
    const source = provider("google_docs", "Google Docs");
    const request = buildDesktopCreateAutomationRequest({
      projectId: "project-1",
      provider: source,
      configValues: { folder_id: "folder-123" },
      targetPath: "Research/Docs",
      runMode: "scheduled",
      schedule: "0 9 * * 1-5",
      timezone: "Asia/Singapore",
    });

    expect(request).toMatchObject({
      project_id: "project-1",
      provider: "google_docs",
      target_folder_path: "Research/Docs",
      target_path: "Research/Docs",
      sync_mode: "scheduled",
      trigger: {
        type: "schedule",
        schedule: "0 9 * * 1-5",
        timezone: "Asia/Singapore",
      },
      config: {
        options: { folder_id: "folder-123" },
      },
    });
    expect(getSupportedAutomationRunModes(source)).toEqual(["manual", "scheduled"]);
    expect(getDefaultAutomationRunMode(source)).toBe("scheduled");
  });
});

function provider(
  providerId: string,
  displayName: string,
  auth: DesktopCloudAutomationProviderSpec["auth"] = "oauth",
): DesktopCloudAutomationProviderSpec {
  return {
    provider: providerId,
    display_name: displayName,
    description: `${displayName} source`,
    auth,
    creation_mode: "direct",
    category: "datasource",
    icon: null,
    default_sync_mode: "scheduled",
    supported_sync_modes: ["manual", "scheduled"],
    config_fields: [{
      key: "folder_id",
      label: "Folder",
      type: "text",
      required: false,
      default: null,
      options: null,
      placeholder: null,
      hint: null,
    }],
  };
}

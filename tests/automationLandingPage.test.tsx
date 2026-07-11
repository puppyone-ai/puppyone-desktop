/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopCloudAutomationProviderSpec,
  DesktopCloudSession,
} from "../src/lib/cloudApi";
import type { AutomationTemplate } from "../src/features/automation/automationTemplates";

vi.mock("../src/features/automation/AutomationDialogs", () => ({
  CloudNewAutomationDialog: ({ template }: { template: AutomationTemplate | null }) => (
    <div data-testid="new-automation-provider">{template?.provider ?? "unselected"}</div>
  ),
  CloudManageAutomationDialog: () => null,
}));

import { CloudAutomationPage } from "../src/features/automation/AutomationPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

const PROVIDERS: DesktopCloudAutomationProviderSpec[] = [
  provider("gmail", "Gmail", "oauth"),
  provider("google_calendar", "Google Calendar", "oauth"),
  provider("google_docs", "Google Docs", "oauth"),
  provider("google_search_console", "Google Search Console", "oauth"),
  provider("google_sheets", "Google Sheets", "oauth"),
  provider("url", "Web Page", "none"),
];

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function renderAutomationPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(
    <CloudAutomationPage
      projectId="project-1"
      cloudSession={{} as DesktopCloudSession}
      apiBaseUrl={null}
      rows={[]}
      totalCount={0}
      loading={false}
      providerSpecs={PROVIDERS}
      providerSpecsLoading={false}
      providerSpecsError={null}
      detailRow={null}
      onOpenRow={vi.fn()}
      onCloseDetail={vi.fn()}
      onCloudSessionChange={vi.fn()}
      onRefresh={vi.fn(async () => undefined)}
      onOpenAccess={vi.fn()}
      onOpenAutomation={vi.fn()}
    />,
  ));
  return container;
}

describe("Automation landing page", () => {
  it("opens with the four popular source-to-project templates", () => {
    const container = renderAutomationPage();

    expect(container.querySelector("h1")?.textContent).toBe("Automations");
    expect(container.querySelectorAll(".desktop-cloud-automation-template-card")).toHaveLength(4);
    expect(
      Array.from(container.querySelectorAll(".desktop-cloud-automation-template-card h2"), (node) => node.textContent),
    ).toEqual([
      "Collect Google Docs",
      "Import Google Sheets",
      "Capture Gmail updates",
      "Track a web source",
    ]);
    expect(container.querySelectorAll(".desktop-cloud-automation-template-route")).toHaveLength(4);
  });

  it("filters categories and carries the selected provider into the creation flow", () => {
    const container = renderAutomationPage();
    const documentsTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find((button) => button.textContent === "Documents");

    act(() => documentsTab?.click());
    expect(
      Array.from(container.querySelectorAll(".desktop-cloud-automation-template-card h2"), (node) => node.textContent),
    ).toEqual(["Collect Google Docs", "Import Google Sheets"]);

    const firstAdd = container.querySelector<HTMLButtonElement>(".desktop-cloud-automation-template-add");
    act(() => firstAdd?.click());
    expect(container.querySelector('[data-testid="new-automation-provider"]')?.textContent).toBe("google_docs");
  });
});

function provider(
  providerId: string,
  displayName: string,
  auth: DesktopCloudAutomationProviderSpec["auth"],
): DesktopCloudAutomationProviderSpec {
  return {
    provider: providerId,
    display_name: displayName,
    description: `${displayName} source`,
    auth,
    creation_mode: "direct",
    category: "datasource",
    icon: null,
    supported_sync_modes: ["manual", "scheduled"],
    default_sync_mode: "scheduled",
    config_fields: [],
  };
}

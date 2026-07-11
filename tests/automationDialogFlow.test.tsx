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
import { CloudNewAutomationDialog } from "../src/features/automation/AutomationDialogs";
import type { AutomationTemplate } from "../src/features/automation/automationTemplates";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("CloudNewAutomationDialog", () => {
  it("opens a template directly in its provider-specific builder", () => {
    const container = renderDialog({
      template: {
        id: "google-docs",
        provider: "google_docs",
        sourceLabel: "Google Docs",
        title: "Collect Google Docs",
        description: "Bring shared documents into this project.",
        categories: ["popular", "documents"],
        iconUrl: null,
      },
    });

    expect(container.querySelector("h2")?.textContent).toBe("Collect Google Docs");
    expect(container.querySelector(".desktop-cloud-automation-source-grid")).toBeNull();
    expect(container.querySelector(".desktop-cloud-automation-map")).not.toBeNull();
    expect(container.querySelector<HTMLSelectElement>('[aria-label="Run trigger"]')?.value).toBe("scheduled");
    expect(
      Array.from(container.querySelectorAll("button"), (button) => button.textContent?.trim()),
    ).toContain("Create automation");
  });

  it("uses source selection only for the generic New action", () => {
    const container = renderDialog({ template: null });

    expect(container.querySelector("h2")?.textContent).toBe("New automation");
    expect(container.querySelectorAll(".desktop-cloud-automation-source-card")).toHaveLength(2);
    expect(container.querySelector(".desktop-cloud-automation-map")).toBeNull();
  });
});

function renderDialog({ template }: { template: AutomationTemplate | null }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(
    <CloudNewAutomationDialog
      projectId="project-1"
      cloudSession={{} as DesktopCloudSession}
      apiBaseUrl={null}
      providers={[
        provider("google_docs", "Google Docs"),
        provider("url", "Web Page"),
      ]}
      providersLoading={false}
      providersError={null}
      template={template}
      onCloudSessionChange={vi.fn()}
      onRefresh={vi.fn(async () => undefined)}
      onOpenAutomation={vi.fn()}
      onClose={vi.fn()}
    />,
  ));
  return container;
}

function provider(providerId: string, displayName: string): DesktopCloudAutomationProviderSpec {
  return {
    provider: providerId,
    display_name: displayName,
    description: `${displayName} source`,
    auth: "none",
    creation_mode: "direct",
    category: "datasource",
    icon: null,
    default_sync_mode: "scheduled",
    supported_sync_modes: ["manual", "scheduled"],
    config_fields: [],
  };
}

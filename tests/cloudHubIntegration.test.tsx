/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CloudServiceSidebar } from "../src/features/cloud/CloudServiceSidebar";
import type { CloudAuthState } from "../src/features/cloud/auth";
import { FeatureFlagsProvider } from "../src/features/flags";
import type { DesktopCloudSession } from "../src/lib/cloudApi";
import { renderWithTestLocalization } from "./testLocalization";

const session: DesktopCloudSession = {
  expires_in: 3600,
  expires_at: Date.now() + 3600_000,
  user_id: "user-1",
  user_email: "owner@example.com",
  api_base_url: "https://cloud.example.com",
  session_generation: "generation-1",
  status: "authenticated",
};

describe("current-repository Cloud navigation", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  it("keeps one stable sidebar while signed out, uninitialized, and linked", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onSelectSection = vi.fn();

    renderSidebar(root, {
      authState: { status: "signed-out", apiBaseUrl: session.api_base_url },
      projectAvailable: false,
      onSelectSection,
    });
    expect(labels(container)).toEqual([
      "Overview", "History", "Automation", "Access", "Settings", "Team", "Billing",
    ]);
    expect(rows(container).every((row) => row.getAttribute("aria-disabled") === "true")).toBe(true);

    renderSidebar(root, {
      authState: signedInState(),
      projectAvailable: false,
      onSelectSection,
    });
    expect(labels(container)).toEqual([
      "Overview", "History", "Automation", "Access", "Settings", "Team", "Billing",
    ]);
    expect(rows(container).slice(0, 5).every((row) => row.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(rows(container).slice(5).every((row) => row.getAttribute("aria-disabled") !== "true")).toBe(true);

    renderSidebar(root, {
      authState: signedInState(),
      projectAvailable: true,
      projectCapabilities: ["project.settings.manage"],
      onSelectSection,
    });
    expect(rows(container).every((row) => row.getAttribute("aria-disabled") !== "true")).toBe(true);
    act(() => rows(container)[1]?.click());
    expect(onSelectSection).toHaveBeenCalledWith("history");
  });
});

function renderSidebar(root: Root, {
  authState,
  projectAvailable,
  projectCapabilities = [],
  onSelectSection,
}: {
  authState: CloudAuthState;
  projectAvailable: boolean;
  projectCapabilities?: string[];
  onSelectSection: (section: Parameters<typeof CloudServiceSidebar>[0]["activeSection"]) => void;
}) {
  act(() => renderWithTestLocalization(root,
    <FeatureFlagsProvider value={{
      cloudWorkspace: true,
      cloudBilling: true,
      assetLibraryHome: false,
      desktopAgentChat: false,
    }}>
      <CloudServiceSidebar
        cloudAuthState={authState}
        activeSection="contents"
        projectAvailable={projectAvailable}
        projectCapabilities={projectCapabilities}
        onSelectSection={onSelectSection}
      />
    </FeatureFlagsProvider>,
  ));
}

function signedInState(): CloudAuthState {
  return { status: "signed-in", apiBaseUrl: session.api_base_url, session };
}

function rows(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".po-sidebar-row"));
}

function labels(container: HTMLElement) {
  return rows(container).map((row) => row.textContent?.trim());
}

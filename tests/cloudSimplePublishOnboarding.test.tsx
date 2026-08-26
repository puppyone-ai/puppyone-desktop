/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudLocalOnlyWorkspace } from "../src/features/cloud/initialization/CloudInitializationView";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("simple Cloud publish onboarding", () => {
  it("presents one outcome-focused publish action instead of manual Git steps", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onPublishWorkspace = vi.fn();

    act(() => root.render(withTestLocalization(
      <CloudLocalOnlyWorkspace
        workspace={{ id: "local-notes", name: "Local Notes", path: "/tmp/local-notes" }}
        accountEmail="dev@example.com"
        branchName="No branch"
        totalCommits={0}
        localChangeCount={3}
        publishReadiness="repository-required"
        isGitRepository={false}
        hasHeadCommit={false}
        hasCurrentBranch={false}
        publishLoading={false}
        organizations={[{ id: "org-1", name: "PuppyOne" }]}
        selectedOrganizationId="org-1"
        organizationStatus="ready"
        onPublishWorkspace={onPublishWorkspace}
      />,
    )));

    expect(container.textContent).toContain("Publish Local Notes to PuppyOne Cloud");
    expect(container.textContent).toContain("Enable Git & Publish");
    expect(container.textContent).not.toContain("Set up Git for this folder");
    expect(container.querySelector(".desktop-cloud-git-prerequisite-steps")).toBeNull();
    const primary = container.querySelector<HTMLButtonElement>(".desktop-cloud-publish-primary");
    expect(primary).not.toBeNull();

    act(() => primary?.click());
    expect(onPublishWorkspace).toHaveBeenCalledWith("org-1");

    act(() => root.unmount());
  });
});

/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudTemplateStore } from "../src/features/cloud/components/CloudTemplateStore";
import type { DesktopCloudSession } from "../src/lib/cloudApi";
import { renderWithTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  listCloudTemplates: vi.fn(),
  getCloudTemplate: vi.fn(),
  instantiateCloudTemplate: vi.fn(),
}));

vi.mock("../src/lib/cloudApi", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/cloudApi")>("../src/lib/cloudApi");
  return {
    ...actual,
    listCloudTemplates: api.listCloudTemplates,
    getCloudTemplate: api.getCloudTemplate,
    instantiateCloudTemplate: api.instantiateCloudTemplate,
  };
});

const session = {
  user_id: "user-1",
  user_email: "dev@example.com",
  api_base_url: "https://cloud.example/api/v1",
  session_generation: "generation-1",
  expires_in: 3600,
  expires_at: 0,
  status: "authenticated",
} as DesktopCloudSession;

const summary = {
  id: "agent-kit",
  name: "Agent Kit",
  description: "A reusable agent project",
  icon: "🤖",
  category: "agents",
  author: "PuppyOne",
  tags: ["agents"],
  preview: [{ name: "README.md", type: "markdown" as const }],
  current_release: {
    id: "1.0.0",
    version: "1.0.0",
    bundle_sha256: "a".repeat(64),
    file_count: 2,
    total_bytes: 120,
  },
};

let root: Root | null = null;

beforeEach(() => {
  api.listCloudTemplates.mockResolvedValue({
    registry: {
      mode: "remote",
      source: "remote",
      catalog_enabled: true,
      instantiation_enabled: true,
    },
    templates: [summary],
    next_cursor: null,
  });
  api.getCloudTemplate.mockResolvedValue({
    ...summary,
    screenshots: [],
    long_description: "A longer description",
    file_tree: ["README.md", "agents/config.json"],
    preview_document: { path: "README.md", content: "# Agent Kit" },
    releases: [summary.current_release],
  });
  api.instantiateCloudTemplate.mockResolvedValue({
    template_id: "agent-kit",
    release_id: "1.0.0",
    project: { id: "project-1", name: "Agent Kit", org_id: "org-1" },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("CloudTemplateStore", () => {
  it("loads the provider-neutral catalog and creates one independent project", async () => {
    const onProjectCreated = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, (
        <CloudTemplateStore
          session={session}
          apiBaseUrl={session.api_base_url}
          onSessionChange={vi.fn()}
          onProjectCreated={onProjectCreated}
        />
      ));
    });
    await vi.waitFor(() => {
      expect(container.querySelector('[data-template-id="agent-kit"]')).not.toBeNull();
    });

    const useButton = container.querySelector<HTMLButtonElement>(
      '[data-template-id="agent-kit"] .desktop-cloud-template-card-footer button',
    );
    await act(async () => {
      useButton?.click();
      useButton?.click();
    });
    await vi.waitFor(() => expect(onProjectCreated).toHaveBeenCalledTimes(1));

    expect(api.instantiateCloudTemplate).toHaveBeenCalledWith(
      session,
      "agent-kit",
      { release_id: "1.0.0" },
      expect.any(Function),
      session.api_base_url,
    );
    expect(api.instantiateCloudTemplate).toHaveBeenCalledTimes(1);
    expect(onProjectCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project-1" }),
    );
  });

  it("loads detail metadata without rendering remote HTML", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, (
        <CloudTemplateStore
          session={session}
          apiBaseUrl={session.api_base_url}
          onSessionChange={vi.fn()}
          onProjectCreated={vi.fn()}
        />
      ));
    });
    await vi.waitFor(() => {
      expect(container.querySelector(".desktop-cloud-template-card-open")).not.toBeNull();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".desktop-cloud-template-card-open")?.click();
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("agents/config.json");
    });

    expect(api.getCloudTemplate).toHaveBeenCalledWith(
      session,
      "agent-kit",
      expect.any(Function),
      session.api_base_url,
    );
    expect(container.querySelector(".desktop-cloud-template-detail-copy")?.textContent)
      .toContain("A longer description");
    expect(container.querySelector("script")).toBeNull();
  });

  it("keeps a catalog browsable when trusted instantiation is disabled", async () => {
    api.listCloudTemplates.mockResolvedValueOnce({
      registry: {
        mode: "remote",
        source: "remote",
        catalog_enabled: true,
        instantiation_enabled: false,
        reason: "trusted_registry_key_required",
      },
      templates: [summary],
      next_cursor: null,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderWithTestLocalization(root, (
        <CloudTemplateStore
          session={session}
          apiBaseUrl={session.api_base_url}
          onSessionChange={vi.fn()}
          onProjectCreated={vi.fn()}
        />
      ));
    });
    await vi.waitFor(() => {
      expect(container.querySelector(".desktop-cloud-template-notice")).not.toBeNull();
    });

    const useButton = container.querySelector<HTMLButtonElement>(
      '[data-template-id="agent-kit"] .desktop-cloud-template-card-footer button',
    );
    expect(useButton?.disabled).toBe(true);
    useButton?.click();
    expect(api.instantiateCloudTemplate).not.toHaveBeenCalled();
  });
});

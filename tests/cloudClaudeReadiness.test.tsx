/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudClaudeSection } from "../src/features/cloud/sections/ClaudeSection";
import type { DesktopCloudProjectReadiness } from "../src/lib/cloudApi";
import { renderWithTestLocalization, stripBidiIsolation } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function readiness(
  state: "git_not_created" | "awaiting_first_push" | "ready",
): DesktopCloudProjectReadiness {
  return {
    project_id: "project-1",
    git: {
      target: { kind: "project_root", project_id: "project-1" },
      surface_exists: state !== "git_not_created",
      head_exists: state === "ready",
      push_accepted: state === "ready",
      default_branch: "main",
      state,
    },
    claude: {
      ready: state === "ready",
      blockers: state === "git_not_created"
        ? ["project_git_surface_missing", "project_head_missing"]
        : state === "awaiting_first_push"
          ? ["project_head_missing", "project_git_push_not_accepted"]
          : [],
    },
  };
}

function renderClaude(input: {
  state: DesktopCloudProjectReadiness;
  scoped?: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const callbacks = {
    onCreateGit: vi.fn(),
    onOpenGitSync: vi.fn(),
    onOpenClaude: vi.fn(),
  };
  act(() => renderWithTestLocalization(root,
    <CloudClaudeSection
      readiness={input.state}
      identity={{ project_id: "project-1", url: "https://cloud.example/git/ap/key.git", scopes: [] }}
      repositoryTarget={input.scoped
        ? { kind: "scope", project_id: "project-1", scope_id: "scope-docs" }
        : { kind: "project_root", project_id: "project-1" }}
      scopePath={input.scoped ? "/docs" : null}
      loading={false}
      {...callbacks}
    />,
  ));
  return { container, callbacks };
}

describe("Claude root Git readiness", () => {
  it("offers Create Git without opening Claude when the root surface is missing", () => {
    const { container, callbacks } = renderClaude({ state: readiness("git_not_created") });
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Create Git");
    expect(action).toBeTruthy();
    act(() => action?.click());
    expect(callbacks.onCreateGit).toHaveBeenCalledOnce();
    expect(callbacks.onOpenClaude).not.toHaveBeenCalled();
  });

  it("offers first-push guidance when root Git exists without an accepted head", () => {
    const { container, callbacks } = renderClaude({ state: readiness("awaiting_first_push") });
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Push your first commit");
    expect(stripBidiIsolation(container.textContent)).toContain(
      "Cloud has not accepted the first Project-root Git push on main",
    );
    act(() => action?.click());
    expect(callbacks.onOpenGitSync).toHaveBeenCalledOnce();
    expect(callbacks.onOpenClaude).not.toHaveBeenCalled();
  });

  it("does not unlock Claude for a Scope checkout even if the Project is ready", () => {
    const { container, callbacks } = renderClaude({ state: readiness("ready"), scoped: true });
    expect(container.textContent).toContain("This is a scoped checkout");
    expect(container.textContent).toContain("/docs");
    expect(container.textContent).not.toContain("Open Claude");
    expect(callbacks.onOpenClaude).not.toHaveBeenCalled();
  });

  it("does not let a Product/API root edit impersonate the first Git push", () => {
    const productHead = readiness("ready");
    productHead.git.push_accepted = false;
    productHead.git.state = "awaiting_first_push";
    productHead.claude.ready = false;
    productHead.claude.blockers = ["project_git_push_not_accepted"];
    const { container, callbacks } = renderClaude({ state: productHead });
    expect(container.textContent).toContain("Push the first root commit");
    expect(container.textContent).not.toContain("Open Claude");
    expect(callbacks.onOpenClaude).not.toHaveBeenCalled();
  });

  it("opens Claude only after root Git, a canonical head, and the first accepted Git push", () => {
    const { container, callbacks } = renderClaude({ state: readiness("ready") });
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Open Claude");
    expect(action).toBeTruthy();
    act(() => action?.click());
    expect(callbacks.onOpenClaude).toHaveBeenCalledOnce();
  });
});

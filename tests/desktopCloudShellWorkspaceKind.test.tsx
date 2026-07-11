/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  DesktopCloudShell,
  type DesktopWorkspaceKind,
} from "../src/components/DesktopCloudShell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("DesktopCloudShell workspace-aware titlebar", () => {
  it.each<DesktopWorkspaceKind>(["local", "cloud"])(
    "exposes the %s workspace kind to titlebar styling",
    (workspaceKind) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      act(() => root?.render(
        <DesktopCloudShell workspaceKind={workspaceKind}>
          <div>Workspace content</div>
        </DesktopCloudShell>,
      ));

      expect(
        container.querySelector(".desktop-titlebar")?.getAttribute("data-workspace-kind"),
      ).toBe(workspaceKind);
    },
  );
});

/**
 * @vitest-environment happy-dom
 */
import React, { createRef } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHeaderElementDefinition,
  type HeaderElementRenderContext,
} from "../src/features/app-shell/headerElements";
import { AgentChatTitlebarButton } from "../src/features/app-shell/DesktopTitlebarActions";
import {
  RIGHT_SIDEBAR_SURFACE_STORAGE_KEY,
  readInitialRightSidebarSurface,
} from "../src/features/app-shell/preferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("independent Chat and Terminal titlebar buttons", () => {
  it("defaults the right sidebar to Terminal until the user opens Chat", () => {
    expect(readInitialRightSidebarSurface()).toBe("terminal");
    window.localStorage.setItem(RIGHT_SIDEBAR_SURFACE_STORAGE_KEY, "chat");
    expect(readInitialRightSidebarSurface()).toBe("chat");
  });

  it("keeps the normal Terminal button and menu free of Chat controls", () => {
    const container = renderHeaderActions(false);

    expect(container.querySelector('button[aria-label="Hide Terminal"]')).not.toBeNull();
    expect(container.textContent).toContain("Clear Terminal");
    expect(container.textContent).toContain("Reset Terminal");
    expect(container.querySelector('button[aria-label="Show Agent Chat"]')).toBeNull();
  });

  it("adds a separate Chat logo only when the experiment is enabled", () => {
    const container = renderHeaderActions(true);

    expect(container.querySelector('button[aria-label="Hide Terminal"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Show Agent Chat"]')).not.toBeNull();
    expect(container.querySelectorAll("button.desktop-titlebar-action").length).toBeGreaterThanOrEqual(2);
  });
});

function renderHeaderActions(chatEnabled: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const definition = getHeaderElementDefinition("terminal");
  if (!definition) throw new Error("Terminal header action is missing.");
  const context: HeaderElementRenderContext = {
    externalOpen: {
      canOpen: false,
      loading: false,
      menuOpen: false,
      menuTargets: [],
      onCustomize: vi.fn(),
      onOpen: vi.fn(),
      onOpenWithApp: vi.fn(),
      ref: createRef<HTMLDivElement>(),
      setMenuOpen: vi.fn(),
    },
    terminal: {
      enabled: true,
      menuOpen: true,
      onClear: vi.fn(),
      onCloseMenu: vi.fn(),
      onReset: vi.fn(),
      onToggleMenu: vi.fn(),
      onToggle: vi.fn(),
      ref: createRef<HTMLDivElement>(),
      sidebarOpen: true,
    },
  };

  act(() => root?.render(React.createElement(
    React.Fragment,
    null,
    definition.render(context),
    React.createElement(AgentChatTitlebarButton, {
      enabled: chatEnabled,
      open: false,
      onToggle: vi.fn(),
    }),
  )));
  return container;
}

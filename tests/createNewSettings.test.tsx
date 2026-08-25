/**
 * @vitest-environment happy-dom
 */
import React, { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateNewSettingsView } from "../src/features/settings/main/CreateNewSettingsView";
import {
  cloneDefaultCreateNewMenuSettings,
  DEFAULT_EXPERIMENTAL_SETTINGS,
  type CreateNewMenuSettings,
} from "../src/preferences";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Create New settings", () => {
  it("uses the shared switch and renders the actual main-menu and submenu structure", () => {
    const container = render(defaultSettings(), vi.fn());

    expect(container.textContent).toContain("Main menu");
    expect(container.textContent).toContain("Submenu items");
    expect(container.querySelector(".desktop-create-new-preview-card")).toBeNull();
    expect(container.querySelector(".desktop-create-new-switch")).toBeNull();
    expect(container.querySelectorAll(".desktop-settings-switch")).toHaveLength(9);
    expect(readLabels(container, ".desktop-create-new-menu-editor:first-of-type .desktop-create-new-row-label"))
      .toEqual(["Folder", "Markdown file", "CSV file", "HTML file", "Custom files"]);
    expect(readLabels(container, ".desktop-create-new-menu-editor:nth-of-type(2) .desktop-create-new-row-label"))
      .toEqual(["Context Map", "Text file", "JSON file", "Slides", "PuppyOne app", "PuppyFlow file"]);
  });

  it("moves a main-menu item into the submenu and persists the placement", () => {
    const onChange = vi.fn();
    const container = render(defaultSettings(), onChange);

    click(container.querySelector('[aria-label="Move CSV file to submenu"]'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      version: 4,
      items: expect.arrayContaining([
        expect.objectContaining({ kind: "csv", enabled: true, placement: "submenu" }),
      ]),
    }));
    expect(readLabels(container, ".desktop-create-new-menu-editor:first-of-type .desktop-create-new-row-label"))
      .toEqual(["Folder", "Markdown file", "HTML file", "Custom files"]);
    expect(readLabels(container, ".desktop-create-new-menu-editor:nth-of-type(2) .desktop-create-new-row-label"))
      .toEqual([
        "Context Map",
        "Text file",
        "JSON file",
        "Slides",
        "PuppyOne app",
        "PuppyFlow file",
        "CSV file",
      ]);
  });

  it("moves a submenu item into the main menu", () => {
    const onChange = vi.fn();
    const container = render(defaultSettings(), onChange);

    click(container.querySelector('[aria-label="Move Context Map to main menu"]'));

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ kind: "contextMap", placement: "main" }),
      ]),
    }));
    expect(readLabels(container, ".desktop-create-new-menu-editor:first-of-type .desktop-create-new-row-label"))
      .toEqual(["Folder", "Markdown file", "CSV file", "HTML file", "Context Map", "Custom files"]);
  });

  it("keeps ordering and visibility controls within each menu group", () => {
    const onChange = vi.fn();
    const container = render(defaultSettings(), onChange);

    click(container.querySelector('[aria-label="Move CSV file up"]'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ kind: "csv", placement: "main" }),
      ]),
    }));
    expect(readLabels(container, ".desktop-create-new-menu-editor:first-of-type .desktop-create-new-row-label"))
      .toEqual(["Folder", "CSV file", "Markdown file", "HTML file", "Custom files"]);

    click(container.querySelector('[aria-label="Show Markdown file in the New menu"]'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        { kind: "markdown", enabled: false, placement: "main" },
      ]),
    }));
  });

  it("keeps experimental types visible but unavailable until their feature is enabled", () => {
    const container = render(defaultSettings(), vi.fn());
    const puppyflow = container.querySelector<HTMLInputElement>(
      '[aria-label="Show PuppyFlow file in the New menu"]',
    );

    expect(puppyflow?.disabled).toBe(true);
    expect(puppyflow?.closest(".desktop-create-new-row")?.dataset.unavailable).toBe("true");
  });
});

function render(settings: CreateNewMenuSettings, onChange: (settings: CreateNewMenuSettings) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Harness() {
    const [currentSettings, setCurrentSettings] = useState(settings);
    return (
      <CreateNewSettingsView
        settings={currentSettings}
        experimentalSettings={DEFAULT_EXPERIMENTAL_SETTINGS}
        fileIconTheme="default"
        onChange={(nextSettings) => {
          setCurrentSettings(nextSettings);
          onChange(nextSettings);
        }}
      />
    );
  }

  root = createRoot(container);
  act(() => root?.render(withTestLocalization(<Harness />)));
  return container;
}

function click(target: Element | null) {
  if (!(target instanceof HTMLElement)) throw new Error("Expected a clickable element");
  act(() => target.click());
}

function readLabels(container: HTMLElement, selector: string): string[] {
  return Array.from(container.querySelectorAll(selector), (element) => element.textContent?.trim() ?? "");
}

function defaultSettings(): CreateNewMenuSettings {
  return cloneDefaultCreateNewMenuSettings();
}

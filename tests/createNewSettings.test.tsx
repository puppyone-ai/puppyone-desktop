/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateNewSettingsView } from "../src/features/settings/main/CreateNewSettingsView";
import {
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
  it("keeps Folder fixed while moving, toggling, and removing file types", () => {
    const onChange = vi.fn();
    const container = render(defaultSettings(), onChange);

    expect(container.querySelector(".desktop-create-new-preview-card")).toBeNull();
    expect(Array.from(
      container.querySelectorAll(".desktop-create-new-row-label strong"),
      (item) => item.textContent?.trim(),
    )).toEqual(["Folder", "Markdown file", "CSV file"]);

    click(container.querySelector('[aria-label="Move CSV file up"]'));
    expect(onChange).toHaveBeenLastCalledWith({
      items: [
        { kind: "csv", enabled: true },
        { kind: "markdown", enabled: true },
      ],
    });

    click(container.querySelector('[aria-label="Show Markdown file in the New menu"]'));
    expect(onChange).toHaveBeenLastCalledWith({
      items: [
        { kind: "markdown", enabled: false },
        { kind: "csv", enabled: true },
      ],
    });

    click(container.querySelector('[aria-label="Remove CSV file"]'));
    expect(onChange).toHaveBeenLastCalledWith({
      items: [{ kind: "markdown", enabled: true }],
    });
  });

  it("adds an available type at the end and offers no experimental types by default", () => {
    const onChange = vi.fn();
    const container = render(defaultSettings(), onChange);

    click(findButton(container, "Add file type"));
    expect(container.textContent).toContain("Text file");
    expect(container.textContent).toContain("JSON file");
    expect(container.textContent).not.toContain("PuppyOne app");
    expect(container.textContent).not.toContain("PuppyFlow file");

    click(findButton(container, "Text file"));
    expect(onChange).toHaveBeenLastCalledWith({
      items: [
        { kind: "markdown", enabled: true },
        { kind: "csv", enabled: true },
        { kind: "text", enabled: true },
      ],
    });
  });

  it("keeps an unavailable experimental type removable while disabling its switch", () => {
    const settings: CreateNewMenuSettings = {
      items: [
        { kind: "app", enabled: true },
        { kind: "csv", enabled: true },
      ],
    };
    const container = render(settings, vi.fn());

    expect(container.querySelector<HTMLInputElement>(
      '[aria-label="Show PuppyOne app in the New menu"]',
    )?.disabled).toBe(true);
    expect(container.querySelector('[data-unavailable] .desktop-create-new-row-label')?.textContent)
      .toContain("PuppyOne app");
  });
});

function render(settings: CreateNewMenuSettings, onChange: (settings: CreateNewMenuSettings) => void) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(
    <CreateNewSettingsView
      settings={settings}
      experimentalSettings={DEFAULT_EXPERIMENTAL_SETTINGS}
      fileIconTheme="default"
      onChange={onChange}
    />,
  )));
  return container;
}

function click(target: Element | null) {
  if (!(target instanceof HTMLElement)) throw new Error("Expected a clickable element");
  act(() => target.click());
}

function findButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`Missing button containing ${text}`);
  return button;
}

function defaultSettings(): CreateNewMenuSettings {
  return {
    items: [
      { kind: "markdown", enabled: true },
      { kind: "csv", enabled: true },
    ],
  };
}

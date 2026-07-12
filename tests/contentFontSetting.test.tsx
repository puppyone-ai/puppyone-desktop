/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentFontSetting } from "../src/features/settings/ContentFontSetting";
import {
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  TypographyCatalogProvider,
  type FontCatalogEntry,
} from "../src/features/typography";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ContentFontSetting", () => {
  it("renders future imported catalog entries without changing its preference contract", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onChange = vi.fn();

    act(() => root?.render(
      <TypographyCatalogProvider additionalEntries={[importedFont]}>
        <ContentFontSetting
          preferences={DEFAULT_TYPOGRAPHY_PREFERENCES}
          onChange={onChange}
        />
      </TypographyCatalogProvider>,
    ));

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Geist",
      "System",
      "Serif",
      "Imported",
    ]);

    act(() => buttons.at(-1)?.click());
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_TYPOGRAPHY_PREFERENCES,
      contentFontId: importedFont.id,
    });
  });
});

const importedFont: FontCatalogEntry = {
  id: "imported:fixture-font",
  label: "Imported",
  description: "Imported fixture font",
  family: '"PuppyOne Imported Fixture", serif',
  source: "imported",
  roles: ["content"],
};

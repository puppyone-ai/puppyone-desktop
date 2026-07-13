/**
 * @vitest-environment happy-dom
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentFontSetting } from "../src/features/settings/ContentFontSetting";
import {
  DEFAULT_TYPOGRAPHY_PREFERENCES,
  TypographyCatalogProvider,
  type FontCatalogEntry,
} from "../src/features/typography";
import { renderWithTestLocalization, stripBidiIsolation } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ContentFontSetting", () => {
  it("updates the selected content font without rendering a redundant preview field", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function ControlledSetting() {
      const [preferences, setPreferences] = useState(DEFAULT_TYPOGRAPHY_PREFERENCES);
      return <ContentFontSetting preferences={preferences} onChange={setPreferences} />;
    }

    act(() => renderWithTestLocalization(root,
      <TypographyCatalogProvider>
        <ControlledSetting />
      </TypographyCatalogProvider>,
    ));

    const serifButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((candidate) => (
        stripBidiIsolation(candidate.getAttribute("aria-label")) === "Use Serif for content"
      ));
    expect(serifButton).not.toBeNull();
    expect(container.querySelector(".desktop-content-font-preview")).toBeNull();
    expect(container.textContent).not.toContain("Knowledge, notes, and ideas");
    expect(container.textContent).not.toContain("知识、笔记与思考");

    act(() => serifButton?.click());

    expect(serifButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders future imported catalog entries without changing its preference contract", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onChange = vi.fn();

    act(() => renderWithTestLocalization(root,
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

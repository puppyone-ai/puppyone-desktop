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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("ContentFontSetting", () => {
  it("previews the selected content font immediately without changing UI typography", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function ControlledSetting() {
      const [preferences, setPreferences] = useState(DEFAULT_TYPOGRAPHY_PREFERENCES);
      return <ContentFontSetting preferences={preferences} onChange={setPreferences} />;
    }

    act(() => root?.render(
      <TypographyCatalogProvider>
        <ControlledSetting />
      </TypographyCatalogProvider>,
    ));

    const serifButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Use Serif for content"]',
    );
    const preview = container.querySelector<HTMLOutputElement>(".desktop-content-font-preview");
    expect(serifButton).not.toBeNull();
    expect(preview?.dataset.fontId).toBe("builtin:geist-sans");
    expect(preview?.style.fontFamily).toContain("Geist Sans");

    act(() => serifButton?.click());

    expect(serifButton?.getAttribute("aria-pressed")).toBe("true");
    expect(preview?.dataset.fontId).toBe("builtin:system-serif");
    expect(preview?.style.fontFamily).toContain("ui-serif");
    expect(preview?.getAttribute("aria-label")).toBe("Serif content font preview");
    expect(container.querySelector(".desktop-content-font-preview-text")?.textContent).toContain("知识");
  });

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

/** @vitest-environment happy-dom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MARKDOWN_PRESENTATION_SETTINGS } from "../src/features/markdown/markdownPresentation";
import { EditorSettingsView } from "../src/features/settings/main/EditorSettingsView";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Editor settings", () => {
  it("updates one Markdown presentation preference without discarding the others", () => {
    const onChange = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(withTestLocalization(
      <EditorSettingsView
        markdownPresentation={DEFAULT_MARKDOWN_PRESENTATION_SETTINGS}
        onMarkdownPresentationChange={onChange}
      />,
    )));

    const headingScale = host.querySelector<HTMLElement>('[aria-label="Heading 1 size"]');
    const largeButton = Array.from(headingScale?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent === "Large");
    expect(largeButton).toBeDefined();

    act(() => largeButton?.click());
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_MARKDOWN_PRESENTATION_SETTINGS,
      h1Scale: "large",
    });
    expect(host.querySelector('[aria-label="Markdown style preview"]')).not.toBeNull();
  });
});

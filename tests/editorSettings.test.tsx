/** @vitest-environment happy-dom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorSettingsView } from "../src/features/settings/main/EditorSettingsView";
import { DEFAULT_TYPOGRAPHY_PREFERENCES } from "../src/features/typography";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const EDITABLE_TEXT_SIZE_DECISION = {
  requestedValue: "default",
  effectiveValue: "default",
  status: "editable",
  source: "user",
} as const;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Editor settings", () => {
  it("exposes only Text font and content text size", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(withTestLocalization(
      <EditorSettingsView
        textSizeDecision={EDITABLE_TEXT_SIZE_DECISION}
        typographyPreferences={DEFAULT_TYPOGRAPHY_PREFERENCES}
        markdownThemeId="default-neutral"
        onTextSizeChange={vi.fn()}
        onTypographyPreferencesChange={vi.fn()}
      />,
    )));

    expect(host.querySelector('[aria-label="Text font"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Content font"]')).toBeNull();
    expect(host.querySelector('[aria-label="Text size"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Heading size"]')).toBeNull();
    expect(host.querySelector('[aria-label="Bold color"]')).toBeNull();
    expect(host.querySelector('[aria-label="Bold weight"]')).toBeNull();
    expect(host.querySelector('[aria-label="Markdown style preview"]')).toBeNull();
    expect(host.querySelector("[data-active-markdown-theme]")).toBeNull();
    expect(host.querySelector("[data-manage-themes]")).toBeNull();
    expect(host.querySelector("[data-reset-markdown-overrides]")).toBeNull();
  });

  it("previews H1-H3, body, and bold typography with standard labels", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(withTestLocalization(
      <EditorSettingsView
        textSizeDecision={EDITABLE_TEXT_SIZE_DECISION}
        typographyPreferences={DEFAULT_TYPOGRAPHY_PREFERENCES}
        markdownThemeId="default-neutral"
        onTextSizeChange={vi.fn()}
        onTypographyPreferencesChange={vi.fn()}
      />,
    )));

    const preview = host.querySelector<HTMLElement>('[aria-label="Typography preview"]');
    expect(preview).not.toBeNull();
    expect(preview?.dataset.poThemeSurface).toBe("markdown");
    expect(preview?.dataset.poThemeId).toBe("default-neutral");
    expect(preview?.dataset.poTypographyRole).toBe("content");
    expect(preview?.querySelector('[role="document"]')?.getAttribute("lang")).toBe("en");
    expect(preview?.querySelector("h1")?.textContent).toBe("H1 Title");
    expect(preview?.querySelector("h2")?.textContent).toBe("H2 Title");
    expect(preview?.querySelector("h3")?.textContent).toBe("H3 Title");
    const body = preview?.querySelector(".desktop-editor-typography-preview-body");
    expect(body?.textContent).toBe(
      "Body text demonstrates how clear typography creates a comfortable reading experience.",
    );
    expect(body?.querySelector("strong")?.textContent).toBe("comfortable reading experience");
  });

  it("updates content text size from the Editor typography controls", () => {
    const onTextSizeChange = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(withTestLocalization(
      <EditorSettingsView
        textSizeDecision={EDITABLE_TEXT_SIZE_DECISION}
        typographyPreferences={DEFAULT_TYPOGRAPHY_PREFERENCES}
        markdownThemeId="default-neutral"
        onTextSizeChange={onTextSizeChange}
        onTypographyPreferencesChange={vi.fn()}
      />,
    )));

    const largeButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[aria-label="Text size"] button'),
    ).find((button) => button.textContent === "Large");
    act(() => largeButton?.click());
    expect(onTextSizeChange).toHaveBeenCalledWith("large");
  });
});

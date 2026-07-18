/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INTERFACE_STYLES, type InterfaceStyle } from "../src/features/appearance/interfaceStyles";
import { InterfacePaletteSettings } from "../src/features/settings/main/InterfacePaletteSettings";
import { InterfaceStyleSetting } from "../src/features/settings/main/InterfaceStyleSetting";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("Interface style settings", () => {
  it("renders style choices from the registry and emits their typed id", () => {
    const onChange = vi.fn();
    const host = mount(
      <InterfaceStyleSetting value="default" onChange={onChange} />,
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];

    expect(buttons).toHaveLength(INTERFACE_STYLES.length);
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Default",
      "Windows XP",
      "macOS Tiger",
    ]);
    expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");

    act(() => buttons[2]?.click());
    expect(onChange).toHaveBeenCalledWith("macos-tiger");
  });

  it("shows color controls only when the selected style declares an adaptive palette", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    renderPalette(host, "default");
    expect(host.querySelectorAll(".desktop-theme-choice")).toHaveLength(3);
    expect(host.textContent).toContain("Light theme");
    expect(host.textContent).toContain("Dark theme");

    for (const style of INTERFACE_STYLES.filter(({ palette }) => palette.kind === "fixed")) {
      renderPalette(host, style.id);
      expect(host.querySelector(".desktop-theme-choice")).toBeNull();
      expect(host.querySelector(".desktop-theme-preset-list")).toBeNull();
      expect(host.textContent).toBe("");
    }
  });
});

function mount(element: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(withTestLocalization(element)));
  return host;
}

function renderPalette(host: HTMLElement, interfaceStyle: InterfaceStyle) {
  act(() => root?.render(withTestLocalization(
    <InterfacePaletteSettings
      interfaceStyle={interfaceStyle}
      themeMode="system"
      lightThemePreset="neutral"
      darkThemePreset="default"
      onThemeModeChange={() => undefined}
      onLightThemePresetChange={() => undefined}
      onDarkThemePresetChange={() => undefined}
    />,
  )));
  return host;
}

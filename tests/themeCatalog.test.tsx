// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeCatalog, type ThemeCatalogController } from "../src/features/themes/useThemeCatalog";
import { DEFAULT_SURFACE_THEME_PREFERENCES } from "../src/features/themes/themePreferences";
import type { ThemeColorMode } from "../src/features/themes/themeTypes";
import type { DesktopThemeSnapshot } from "../src/types/electron";

let container: HTMLDivElement;
let root: Root;
let latest: ThemeCatalogController | null;
const originalDesktopApi = window.puppyoneDesktop;

beforeEach(() => {
  latest = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.puppyoneDesktop = originalDesktopApi;
});

describe("renderer theme catalog", () => {
  it("loads themes and refreshes them when the window regains focus", async () => {
    const first = snapshot("com.example.first");
    const second = snapshot("com.example.second");
    const list = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second);
    window.puppyoneDesktop = {
      themes: {
        list,
        openDirectory: vi.fn(async () => ({ opened: true as const })),
      },
    } as typeof window.puppyoneDesktop;

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    expect(list).toHaveBeenCalledOnce();
    expect(latest?.status).toBe("ready");
    expect(latest?.snapshot.themes.some((theme) => theme.id === "default")).toBe(true);
    expect(latest?.snapshot.themes.some((theme) => theme.id === "com.example.first")).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(list).toHaveBeenCalledTimes(2);
    expect(latest?.snapshot.themes.some((theme) => theme.id === "com.example.first")).toBe(false);
    expect(latest?.snapshot.themes.some((theme) => theme.id === "com.example.second")).toBe(true);
  });

  it("uses built-ins when the desktop host API is unavailable", async () => {
    window.puppyoneDesktop = undefined;

    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    expect(latest?.status).toBe("ready");
    expect(latest?.error).toBeNull();
    expect(latest?.snapshot.themes.map((theme) => theme.id)).toEqual([
      "default",
      "builtin.pack.github",
      "builtin.pack.newspaper",
    ]);
  });

  it("surfaces failures while opening the themes directory", async () => {
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => ({ themes: [], diagnostics: [] })),
        openDirectory: vi.fn(async () => { throw new Error("Finder unavailable"); }),
      },
    } as typeof window.puppyoneDesktop;
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    let result: { opened: boolean } | undefined;
    await act(async () => {
      result = await latest?.openDirectory();
    });

    expect(result).toEqual({ opened: false });
    expect(latest?.status).toBe("error");
    expect(latest?.error).toBe("Finder unavailable");
  });

  it("falls back every surface when the active pack is incomplete", async () => {
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => snapshot("com.example.first")),
        openDirectory: vi.fn(async () => ({ opened: true as const })),
      },
    } as typeof window.puppyoneDesktop;

    await act(async () => {
      root.render(
        <Harness
          colorMode="light"
          preferences={{
            ...DEFAULT_SURFACE_THEME_PREFERENCES,
            pack: "com.example.first",
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(latest?.selection).toEqual({
      application: "default",
      markdown: "default",
      csv: "default",
    });

    await act(async () => {
      root.render(
        <Harness
          colorMode="dark"
          preferences={{
            ...DEFAULT_SURFACE_THEME_PREFERENCES,
            pack: "com.example.first",
          }}
        />,
      );
    });

    expect(latest?.selection.markdown).toBe("default");
  });

  it("syncs one theme pack to the native menu and routes pack requests", async () => {
    const syncNativeMenu = vi.fn(async () => ({ synced: true as const }));
    let requestSelection: ((request: {
      kind: "pack";
      themeId: string;
    }) => void) | undefined;
    const onThemePackChange = vi.fn();
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => ({ themes: [], diagnostics: [] })),
        openDirectory: vi.fn(async () => ({ opened: true as const })),
        syncNativeMenu,
        onSelectionRequested: vi.fn((callback) => {
          requestSelection = callback;
          return () => undefined;
        }),
      },
    } as typeof window.puppyoneDesktop;

    await act(async () => {
      root.render(
        <NativeHarness onThemePackChange={onThemePackChange} />,
      );
      await Promise.resolve();
    });

    expect(syncNativeMenu).toHaveBeenCalledWith(expect.objectContaining({
      pack: "builtin.pack.forest",
    }));
    expect(syncNativeMenu.mock.calls.at(-1)?.[0]).not.toHaveProperty("overrides");
    expect(syncNativeMenu.mock.calls.at(-1)?.[0]).not.toHaveProperty("selection");
    act(() => requestSelection?.({ kind: "pack", themeId: "builtin.pack.github" }));
    expect(onThemePackChange).toHaveBeenCalledWith("builtin.pack.github");
  });
});

function Harness({
  colorMode = "light",
  preferences = DEFAULT_SURFACE_THEME_PREFERENCES,
}: {
  colorMode?: ThemeColorMode;
  preferences?: typeof DEFAULT_SURFACE_THEME_PREFERENCES;
} = {}) {
  latest = useThemeCatalog({ colorMode, preferences });
  return null;
}

function NativeHarness({
  onThemePackChange,
}: {
  onThemePackChange: (themeId: string) => void;
}) {
  latest = useThemeCatalog({
    colorMode: "light",
    preferences: {
      version: 5,
      pack: "builtin.pack.forest",
    },
    onThemePackChange,
  });
  return null;
}

function snapshot(id: string): DesktopThemeSnapshot {
  return {
    themes: [{
      id,
      name: id,
      version: "1.0.0",
      modes: ["light"],
      targets: ["markdown"],
      source: "local-package",
      compiledCss: { markdown: `[data-po-theme-id="${id}"] { color: red }` },
    }],
    diagnostics: [],
  };
}

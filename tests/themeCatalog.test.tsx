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
  it("loads and reloads the host snapshot while preserving built-ins", async () => {
    const first = snapshot("com.example.first");
    const second = snapshot("com.example.second");
    const list = vi.fn(async () => first);
    const reload = vi.fn(async () => second);
    window.puppyoneDesktop = {
      themes: {
        list,
        reload,
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
      await latest?.reload();
    });

    expect(reload).toHaveBeenCalledOnce();
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
    expect(latest?.snapshot.themes.some((theme) => theme.id === "builtin.csv.ledger")).toBe(true);
  });

  it("surfaces failures while opening the themes directory", async () => {
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => ({ themes: [], diagnostics: [] })),
        reload: vi.fn(async () => ({ themes: [], diagnostics: [] })),
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

  it("exposes the effective selection for the active pack and color mode", async () => {
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => snapshot("com.example.first")),
        reload: vi.fn(async () => snapshot("com.example.first")),
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
      markdown: "com.example.first",
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

  it("loads and saves managed Custom CSS through the catalog controller", async () => {
    const reload = vi.fn(async () => ({ themes: [], diagnostics: [] }));
    const readCustomCss = vi.fn(async () => ({ css: "body { color: teal }" }));
    const saveCustomCss = vi.fn(async () => ({ saved: true as const }));
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => ({ themes: [], diagnostics: [] })),
        reload,
        openDirectory: vi.fn(async () => ({ opened: true as const })),
        readCustomCss,
        saveCustomCss,
      },
    } as typeof window.puppyoneDesktop;
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
    });

    await expect(latest?.readCustomCss("markdown")).resolves.toBe("body { color: teal }");
    await expect(latest?.saveCustomCss("markdown", "body { color: navy }")).resolves.toBe(true);

    expect(readCustomCss).toHaveBeenCalledWith("markdown");
    expect(saveCustomCss).toHaveBeenCalledWith({ target: "markdown", css: "body { color: navy }" });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("syncs theme intent to the native menu and routes pack or override requests", async () => {
    const syncNativeMenu = vi.fn(async () => ({ synced: true as const }));
    let requestSelection: ((request: {
      kind: "pack" | "override";
      target?: "application" | "markdown" | "csv";
      themeId: string | null;
    }) => void) | undefined;
    const onThemePackChange = vi.fn();
    const onThemeOverrideChange = vi.fn();
    window.puppyoneDesktop = {
      themes: {
        list: vi.fn(async () => ({ themes: [], diagnostics: [] })),
        reload: vi.fn(async () => ({ themes: [], diagnostics: [] })),
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
        <NativeHarness
          onThemePackChange={onThemePackChange}
          onThemeOverrideChange={onThemeOverrideChange}
        />,
      );
      await Promise.resolve();
    });

    expect(syncNativeMenu).toHaveBeenCalledWith(expect.objectContaining({
      pack: "builtin.pack.forest",
      overrides: expect.objectContaining({ markdown: "builtin.markdown.newsprint" }),
    }));
    act(() => requestSelection?.({ kind: "pack", themeId: "builtin.pack.github" }));
    act(() => requestSelection?.({ kind: "override", target: "markdown", themeId: null }));
    expect(onThemePackChange).toHaveBeenCalledWith("builtin.pack.github");
    expect(onThemeOverrideChange).toHaveBeenCalledWith("markdown", null);
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
  onThemeOverrideChange,
}: {
  onThemePackChange: (themeId: string) => void;
  onThemeOverrideChange: (target: "application" | "markdown" | "csv", themeId: string | null) => void;
}) {
  latest = useThemeCatalog({
    colorMode: "light",
    preferences: {
      version: 2,
      pack: "builtin.pack.forest",
      overrides: {
        application: null,
        markdown: "builtin.markdown.newsprint",
        csv: null,
      },
    },
    onThemePackChange,
    onThemeOverrideChange,
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

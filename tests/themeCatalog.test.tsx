// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeCatalog, type ThemeCatalogController } from "../src/features/themes/useThemeCatalog";
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
});

function Harness() {
  latest = useThemeCatalog();
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

/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DesktopCreateEntryDialog,
  type DesktopCreateEntryDraft,
} from "../src/features/data-workspace/nodeActions";
import type { AppPreviewProjectCandidate } from "../src/features/data-workspace/appPreviewCreation";
import { withTestLocalization } from "./testLocalization";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("App Preview creation dialog", () => {
  it("shows detected options and applies a selected command", () => {
    const candidates = [candidate("vite", ".", "Vite"), candidate("slides", "slides", "Slidev")];
    let currentDraft = createDraft(candidates);
    const onChange = vi.fn((updater) => {
      currentDraft = typeof updater === "function" ? updater(currentDraft) : updater;
    });
    const container = render(
      <DesktopCreateEntryDialog
        draft={currentDraft}
        onChange={onChange}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Detected start options");
    expect(container.textContent).toContain("Recommended");
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[0]?.checked).toBe(true);

    act(() => radios[1]?.click());
    expect(currentDraft.appPreview).toMatchObject({
      selectedCandidateId: "slides",
      cwd: "slides",
      commandText: "npm run dev -- --host 127.0.0.1 --port ${port}",
    });
  });

  it("keeps creation disabled until detection completes", () => {
    const draft = createDraft([]);
    draft.appPreview = {
      ...draft.appPreview!,
      detectionStatus: "loading",
    };
    const container = render(
      <DesktopCreateEntryDialog
        draft={draft}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Looking for runnable web projects");
    expect(findButton(container, "Create")?.disabled).toBe(true);
  });

  it("reveals manual configuration without replacing the detected defaults", () => {
    const draft = createDraft([candidate("vite", ".", "Vite")]);
    let currentDraft = draft;
    const onChange = vi.fn((updater) => {
      currentDraft = typeof updater === "function" ? updater(currentDraft) : updater;
    });
    const container = render(
      <DesktopCreateEntryDialog
        draft={draft}
        onChange={onChange}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    act(() => findButton(container, "Advanced settings")?.click());
    expect(currentDraft.appPreview?.advanced).toBe(true);
    expect(currentDraft.appPreview?.cwd).toBe(".");
  });
});

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(withTestLocalization(element)));
  return container;
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button"))
    .find((button) => button.textContent?.trim() === text);
}

function createDraft(candidates: readonly AppPreviewProjectCandidate[]): DesktopCreateEntryDraft {
  const selected = candidates[0] ?? null;
  return {
    parentPath: null,
    anchor: { left: 20, top: 20, right: 44, bottom: 44, width: 24, height: 24 },
    error: null,
    creatingKind: null,
    selectedKind: "app",
    name: "Deck.puppyoneapp",
    appPreview: {
      detectionStatus: candidates.length ? "ready" : "empty",
      candidates,
      selectedCandidateId: selected?.id ?? null,
      cwd: selected?.cwd ?? ".",
      commandText: selected?.commandLabel ?? "npm run dev",
      advanced: false,
      configurationTouched: false,
    },
  };
}

function candidate(id: string, cwd: string, framework: AppPreviewProjectCandidate["framework"]): AppPreviewProjectCandidate {
  const command = ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "${port}"];
  return {
    id,
    cwd,
    directoryLabel: cwd,
    script: "dev",
    packageManager: "npm",
    framework,
    command,
    commandLabel: command.join(" "),
    score: 100,
  };
}

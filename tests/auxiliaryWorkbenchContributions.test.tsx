/**
 * @vitest-environment happy-dom
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuxiliaryWorkbenchContribution } from "../src/features/app-shell/auxiliary-workbench/types";
import { useAuxiliaryWorkbenchContributions } from "../src/features/app-shell/auxiliary-workbench/useAuxiliaryWorkbenchContributions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type Registry = ReturnType<typeof useAuxiliaryWorkbenchContributions>;
let latest: Registry | null = null;
let reactRoot: Root | null = null;

afterEach(() => {
  if (reactRoot) act(() => reactRoot?.unmount());
  reactRoot = null;
  latest = null;
  document.body.replaceChildren();
});

describe("Auxiliary Workbench contribution admission", () => {
  it("prepares a lazy contribution before committing one Item", async () => {
    const ready = deferred<void>();
    const contribution = createContribution(() => ready.promise);
    const onCommit = vi.fn(() => "chat-1");
    renderRegistry([contribution], onCommit);

    let first: Promise<string | null>;
    let duplicate: Promise<string | null>;
    act(() => {
      first = current().create(contribution, "group-1");
      duplicate = current().create(contribution, "group-1");
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(current().canCreate(contribution)).toBe(false);
    await expect(duplicate!).resolves.toBeNull();

    await act(async () => {
      ready.resolve();
      await expect(first!).resolves.toBe("chat-1");
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(contribution, "group-1");
  });

  it("reports preparation failure without leaving a topology Item", async () => {
    const prepare = vi.fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce(undefined);
    const contribution = createContribution(prepare);
    const onCommit = vi.fn(() => "chat-1");
    renderRegistry([contribution], onCommit);

    await act(async () => {
      await expect(current().create(contribution, null)).resolves.toBeNull();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(current().creationFailure).toEqual({ kind: "agent-chat", label: "Agent Chat" });
    expect(current().canCreate(contribution)).toBe(true);

    await act(async () => {
      await expect(current().create(contribution, null)).resolves.toBe("chat-1");
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(current().creationFailure).toBeNull();
  });

  it("does not commit when the contribution is disabled while preparation is pending", async () => {
    const ready = deferred<void>();
    const contribution = createContribution(() => ready.promise);
    const onCommit = vi.fn(() => "chat-1");
    const rerender = renderRegistry([contribution], onCommit);

    let creation: Promise<string | null>;
    act(() => {
      creation = current().create(contribution, null);
    });
    rerender([]);
    await act(async () => {
      ready.resolve();
      await expect(creation!).resolves.toBeNull();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

function renderRegistry(
  contributions: readonly AuxiliaryWorkbenchContribution[],
  onCommit: (contribution: AuxiliaryWorkbenchContribution, groupId: string | null) => string,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  reactRoot = createRoot(container);
  const render = (next: readonly AuxiliaryWorkbenchContribution[]) => {
    act(() => reactRoot?.render(<Harness contributions={next} onCommit={onCommit} />));
  };
  render(contributions);
  return render;
}

function Harness({
  contributions,
  onCommit,
}: Readonly<{
  contributions: readonly AuxiliaryWorkbenchContribution[];
  onCommit: (contribution: AuxiliaryWorkbenchContribution, groupId: string | null) => string;
}>) {
  latest = useAuxiliaryWorkbenchContributions({ contributions, items: [], onCommit });
  return null;
}

function current() {
  if (!latest) throw new Error("Contribution registry is not mounted.");
  return latest;
}

function createContribution(prepare: () => Promise<void>): AuxiliaryWorkbenchContribution {
  return Object.freeze({
    kind: "agent-chat",
    label: "Agent Chat",
    createLabel: "New chat",
    initialSnapshot: Object.freeze({
      title: "New chat",
      accessibleLabel: "New chat — Agent Chat",
      detail: "Agent Chat",
      status: "starting" as const,
      running: false,
      resourceId: null,
    }),
    maximumItems: 8,
    minimumSize: Object.freeze({ width: 320, height: 260 }),
    prepare,
    renderItem: () => null,
    requestClose: async () => true,
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

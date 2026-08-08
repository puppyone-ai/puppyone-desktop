import { describe, expect, it, vi } from "vitest";
import {
  flushActiveOfficeEditingSessions,
  registerActiveOfficeEditingSession,
} from "../packages/shared-ui/src/editor/office/activeOfficeEditingSessions";

describe("active Office editing sessions", () => {
  it("keeps a recently detached session inside the app-close durability barrier", async () => {
    const flush = vi.fn(async () => undefined);
    const unregister = registerActiveOfficeEditingSession("office-session-1", flush);
    unregister();

    await flushActiveOfficeEditingSessions();

    expect(flush).toHaveBeenCalledOnce();
    await flushActiveOfficeEditingSessions();
    expect(flush).toHaveBeenCalledOnce();
  });

  it("surfaces a failed Office save so Electron can cancel window close", async () => {
    const unregister = registerActiveOfficeEditingSession(
      "office-session-2",
      async () => { throw new Error("engine save failed"); },
    );

    await expect(flushActiveOfficeEditingSessions()).rejects.toThrow(/Unable to save 1 open Office document/);
    unregister();
    const retire = registerActiveOfficeEditingSession("office-session-2", async () => undefined);
    retire();
    await flushActiveOfficeEditingSessions();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDataPort } from "../src/lib/localFiles";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local document persistence adapter", () => {
  it("forwards the session base version to authorized conditional-write IPC", async () => {
    const writeFile = vi.fn(async () => ({ version: "sha256:new" }));
    vi.stubGlobal("window", {
      puppyoneDesktop: { writeFile },
    });

    const persistence = createLocalDataPort("/workspace").documentPersistence;
    expect(persistence).toMatchObject({
      kind: "local-fs",
    });

    await expect(persistence?.persist({
      path: "notes/today.md",
      content: "updated",
      revision: "editor:r2",
      baseVersion: "sha256:old",
      reason: "edit",
    })).resolves.toEqual({ version: "sha256:new" });

    expect(writeFile).toHaveBeenCalledWith({
      rootPath: "/workspace",
      path: "notes/today.md",
      content: "updated",
      expectedVersion: "sha256:old",
    });
  });
});

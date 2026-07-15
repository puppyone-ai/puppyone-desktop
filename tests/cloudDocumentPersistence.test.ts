import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudDataPort } from "../src/lib/cloudDataPort";
import type { DesktopCloudSession } from "../src/lib/cloudApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cloud document persistence adapter", () => {
  it("carries the read commit into the conditional write and advances the version", async () => {
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    const requestCloudSessionApi = vi.fn(async (request: { path: string; method: string; body?: string }) => {
      requests.push(request);
      if (request.path.includes("/cat?")) {
        return {
          path: "notes.md",
          type: "markdown",
          content_text: "one",
          content_hash: "content-1",
          head_commit_id: "head-1",
        };
      }
      if (request.path.endsWith("/write")) {
        return {
          path: "notes.md",
          commit_id: "head-2",
          merged: false,
          conflicts: [],
        };
      }
      throw new Error(`Unexpected Cloud request: ${request.path}`);
    });
    vi.stubGlobal("window", {
      localStorage: createMemoryStorage(),
      puppyoneDesktop: { requestCloudSessionApi },
    });

    const session = createSession();
    const port = createCloudDataPort({
      projectId: "project-1",
      session,
      apiBaseUrl: session.api_base_url,
    });
    const opened = await port.readFile?.("notes.md");
    expect(opened?.version).toBe("head-1");
    expect(port.documentPersistence).toMatchObject({
      kind: "cloud",
    });

    const result = await port.documentPersistence?.persist({
      path: "notes.md",
      content: "two",
      revision: "editor-r2",
      baseVersion: opened?.version,
      reason: "edit",
    });

    expect(result).toEqual({ version: "head-2" });
    const writeRequest = requests.find(({ path }) => path.endsWith("/write"));
    expect(JSON.parse(writeRequest?.body ?? "{}")).toMatchObject({
      path: "notes.md",
      content: "two",
      node_type: "markdown",
      base_commit_id: "head-1",
    });
  });
});

function createSession(): DesktopCloudSession {
  return {
    expires_in: 3600,
    expires_at: Date.now() + 3_600_000,
    user_id: "user-1",
    user_email: "user@example.com",
    api_base_url: "https://api.puppyone.ai/api/v1",
    session_generation: "generation-1",
    status: "authenticated",
  };
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

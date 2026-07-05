// Unit tests for the desktop cloud API client (src/lib/cloudApi.ts). The client
// shapes requests and delegates to the Electron IPC bridge
// (window.puppyoneDesktop.requestCloudSessionApi). We mock that bridge on
// globalThis.window (no jsdom needed — getDesktopCloudApiBaseUrl guards window
// access in try/catch) and assert request shaping + the session/api-base guards.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudApiRequest, listCloudProjects, getCloudProject } from "../src/lib/cloudApi";

const API = "https://api.puppyone.ai/api/v1";
const session = {
  expires_in: 3600,
  expires_at: 0,
  user_email: "user@example.com",
  api_base_url: API,
};

let bridge: ReturnType<typeof vi.fn>;

beforeEach(() => {
  bridge = vi.fn();
  (globalThis as unknown as { window: unknown }).window = {
    puppyoneDesktop: { requestCloudSessionApi: bridge },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("cloud API client delegation", () => {
  it("listCloudProjects issues GET /projects/ through the bridge and returns its result", async () => {
    bridge.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    const result = await listCloudProjects(session, undefined, API);
    expect(result).toEqual([{ id: "p1" }, { id: "p2" }]);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(bridge).toHaveBeenCalledWith(
      expect.objectContaining({ apiBaseUrl: API, path: "/projects/", method: "GET" }),
    );
  });

  it("getCloudProject URL-encodes the project id in the path", async () => {
    bridge.mockResolvedValue({ id: "a/b" });
    await getCloudProject(session, "a/b", undefined, API);
    expect(bridge).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/projects/a%2Fb", method: "GET" }),
    );
  });
});

describe("session / api-base guards", () => {
  it("rejects with 401 (without calling the bridge) when the requested api base != the session's", async () => {
    const otherApi = "https://qubits-try.puppyone.ai/api/v1";
    await expect(
      cloudApiRequest("/projects/", session, undefined, {}, otherApi),
    ).rejects.toThrow(/sign in/i);
    expect(bridge).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the desktop session bridge is unavailable", async () => {
    (globalThis as unknown as { window: unknown }).window = {
      puppyoneDesktop: undefined,
      localStorage: { getItem: () => null, setItem: () => {} },
    };
    await expect(
      cloudApiRequest("/projects/", session, undefined, {}, API),
    ).rejects.toThrow(/unavailable/i);
  });
});

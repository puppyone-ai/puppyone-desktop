import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCloudApi } from "../electron/main/cloud-api-client.mjs";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Electron Cloud API error transport", () => {
  it("puts HTTP status in the serialized message as well as the local Error", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      message: "Project authorization is temporarily unavailable",
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }));

    const error = await requestCloudApi(
      "http://localhost:9090/api/v1",
      "/projects/project-1",
      { method: "GET" },
    ).then(() => null, (reason) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: "Request failed (503): Project authorization is temporarily unavailable",
      status: 503,
    });
  });
});

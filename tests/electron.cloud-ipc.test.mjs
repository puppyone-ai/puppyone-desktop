import { describe, expect, it, vi } from "vitest";
import { registerCloudIpcHandlers } from "../electron/main/ipc/cloud-ipc.mjs";

function register(cloudAuthService) {
  const handlers = new Map();
  registerCloudIpcHandlers({
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
    },
    cloudAuthService,
  });
  return handlers;
}

describe("Cloud IPC structured error transport", () => {
  it("returns session API data in a versioned success envelope", async () => {
    const requestSessionApi = vi.fn().mockResolvedValue({ project: { id: "project-1" } });
    const handlers = register({ requestSessionApi });

    const result = await handlers.get("cloud:session-api-request")(null, {
      apiBaseUrl: "https://api.puppyone.ai/api/v1",
      path: "/projects/project-1/repository-context",
      method: "POST",
      body: "{}",
    });

    expect(result).toEqual({
      transport: "puppyone-cloud-ipc-v1",
      ok: true,
      data: { project: { id: "project-1" } },
    });
  });

  it("preserves status and code without parsing Electron rejection text", async () => {
    const error = Object.assign(new Error("Project authorization is temporarily unavailable"), {
      status: 503,
      code: "AUTHORIZATION_UNAVAILABLE",
    });
    const handlers = register({ requestSessionApi: vi.fn().mockRejectedValue(error) });

    const result = await handlers.get("cloud:session-api-request")(null, {
      apiBaseUrl: "https://api.puppyone.ai/api/v1",
      path: "/projects/project-1/repository-context",
      method: "POST",
      body: "{}",
    });

    expect(result).toEqual({
      transport: "puppyone-cloud-ipc-v1",
      ok: false,
      error: {
        status: 503,
        code: "AUTHORIZATION_UNAVAILABLE",
        message: "Project authorization is temporarily unavailable",
      },
    });
  });
});

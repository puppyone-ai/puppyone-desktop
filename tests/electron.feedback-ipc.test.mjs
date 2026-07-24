import { describe, expect, it, vi } from "vitest";
import { registerFeedbackIpcHandlers } from "../electron/main/ipc/feedback-ipc.mjs";

describe("feedback IPC", () => {
  it("validates and forwards a trimmed message without workspace or account data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const handler = createHandler({
      fetchImpl,
      appVersion: "0.1.2",
      platform: "darwin",
    });

    await expect(handler({}, {
      message: "  The search result ordering is confusing.  ",
      locale: "zh-Hans",
      workspacePath: "/private/project",
      accountEmail: "private@example.com",
    })).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [endpoint, request] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe("https://feedback.example/api");
    expect(request).toMatchObject({
      method: "POST",
      headers: {
        "user-agent": "puppyone-desktop/0.1.2",
      },
    });
    expect(request.headers).not.toHaveProperty("content-type");
    expect(request.body).toBeInstanceOf(FormData);
    expect(Object.fromEntries(request.body.entries())).toEqual({
      message: "The search result ordering is confusing.",
      appVersion: "0.1.2",
      locale: "zh-Hans",
      platform: "darwin",
      website: "",
    });
  });

  it("rejects empty and oversized feedback before making a network request", async () => {
    const fetchImpl = vi.fn();
    const handler = createHandler({ fetchImpl });

    await expect(handler({}, { message: "   " })).rejects.toThrow(
      "requires a message or screenshot",
    );
    await expect(handler({}, { message: "x".repeat(2_001) })).rejects.toThrow(
      "cannot exceed 2000 characters",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts screenshot-only feedback and forwards a validated image attachment", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const handler = createHandler({ fetchImpl });
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    await expect(handler({}, {
      message: "",
      screenshot: {
        bytes: bytes.buffer,
        mimeType: "image/png",
      },
    })).resolves.toEqual({ ok: true });

    const request = fetchImpl.mock.calls[0][1];
    const screenshot = request.body.get("screenshot");
    expect(request.body.get("message")).toBe("");
    expect(screenshot).toBeInstanceOf(Blob);
    expect(screenshot.type).toBe("image/png");
    expect(screenshot.name).toBe("feedback-screenshot.png");
    expect(
      new Uint8Array(await screenshot.arrayBuffer()),
    ).toEqual(bytes);
  });

  it("rejects a screenshot whose bytes do not match its declared image type", async () => {
    const fetchImpl = vi.fn();
    const handler = createHandler({ fetchImpl });

    await expect(handler({}, {
      screenshot: {
        bytes: new Uint8Array([0x00, 0x01, 0x02]).buffer,
        mimeType: "image/png",
      },
    })).rejects.toThrow("does not match");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a rejected server response as a failed submission", async () => {
    const handler = createHandler({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, code: "email_send_failed" }),
      }),
    });

    await expect(handler({}, { message: "A useful message" })).rejects.toThrow(
      "could not accept",
    );
  });
});

function createHandler({
  fetchImpl = vi.fn(),
  appVersion = "0.1.2",
  platform = "darwin",
} = {}) {
  const handlers = new Map();
  registerFeedbackIpcHandlers({
    ipcMain: {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    fetchImpl,
    appVersion,
    platform,
    endpoint: "https://feedback.example/api",
  });
  return handlers.get("feedback:submit");
}

import { describe, expect, it, vi } from "vitest";
import { startLoopbackCallbackServer } from "../electron/main/auth/loopback-callback-server.mjs";

describe("desktop OAuth loopback callback", () => {
  it("binds a random 127.0.0.1 port and forwards only the exact callback path", async () => {
    const onCallback = vi.fn();
    const server = await startLoopbackCallbackServer({ onCallback });

    expect(server.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    const wrong = await fetch(new URL("/wrong", server.redirectUri));
    expect(wrong.status).toBe(404);
    expect(onCallback).not.toHaveBeenCalled();

    const callback = `${server.redirectUri}?state=state-1&code=code-1`;
    const response = await fetch(callback);
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(onCallback).toHaveBeenCalledWith(callback));
  });
});

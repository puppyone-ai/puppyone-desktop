import { describe, expect, it, vi } from "vitest";
import { OpenCodeHttpClient, parseModelSelection } from "../electron/main/agent/runtimes/opencode-protocol/opencode-http-client.mjs";

describe("OpenCode loopback HTTP client", () => {
  it("keeps authentication internal and uses the versioned session endpoints", async () => {
    const fetchImpl = vi.fn(async (url, request) => new Response(JSON.stringify({ id: "ses_1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const client = new OpenCodeHttpClient({
      baseUrl: "http://127.0.0.1:40321",
      username: "puppyone",
      password: "secret-value",
      fetchImpl,
    });
    const permission = [{ permission: "*", pattern: "*", action: "ask" }];
    const metadata = { "puppyone.promptProfile": "test-profile" };
    await client.createSession({ directory: "/workspace", model: { providerID: "openai", modelID: "gpt-5" }, permission, metadata });
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://127.0.0.1:40321/session?directory=%2Fworkspace");
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(request.headers.authorization).toMatch(/^Basic /);
    expect(JSON.stringify(request)).not.toContain("secret-value");
    expect(JSON.parse(request.body)).toMatchObject({
      model: { providerID: "openai", id: "gpt-5" },
      permission,
      metadata,
    });
  });

  it("parses bounded SSE events across chunks", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"payload\":{\"type\":\"session.idle\",\"properties\":{\"sessionID\":\"s"));
        controller.enqueue(new TextEncoder().encode("es_1\"}}}\r\n\r\n"));
        controller.close();
      },
    });
    const client = new OpenCodeHttpClient({
      baseUrl: "http://localhost:40321",
      username: "p",
      password: "x",
      fetchImpl: async () => new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
    });
    const events = [];
    const order = [];
    await client.subscribeGlobalEvents({
      signal: new AbortController().signal,
      onOpen: async () => {
        await Promise.resolve();
        order.push("reconciled");
      },
      onEvent: (event) => {
        order.push("event");
        events.push(event);
      },
    });
    expect(events).toEqual([{ payload: { type: "session.idle", properties: { sessionID: "ses_1" } } }]);
    expect(order).toEqual(["reconciled", "event"]);
  });

  it("uses the native command endpoint for discovered slash commands", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "message_1" }), { status: 200 }));
    const client = new OpenCodeHttpClient({ baseUrl: "http://127.0.0.1:40321", username: "p", password: "x", fetchImpl });
    await client.command({
      directory: "/workspace",
      sessionID: "ses_1",
      command: "init",
      arguments: "fast",
      model: { providerID: "openai", modelID: "gpt-5", variant: "high" },
      agent: "build",
      variant: "high",
      parts: [{ type: "file", mime: "text/plain", filename: "AGENTS.md", url: "data:text/plain;base64,dGVzdA==" }],
    });
    const [url, request] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("/session/ses_1/command?directory=%2Fworkspace");
    expect(JSON.parse(request.body)).toMatchObject({ command: "init", arguments: "fast", model: "openai/gpt-5", agent: "build", variant: "high" });
  });

  it("uses OpenCode's connected-provider catalog instead of the configuration catalog", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ all: [], connected: [], default: {} }), { status: 200 }));
    const client = new OpenCodeHttpClient({ baseUrl: "http://127.0.0.1:40321", username: "p", password: "x", fetchImpl });

    await client.providerCatalog("/workspace");

    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://127.0.0.1:40321/provider?directory=%2Fworkspace");
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
  });

  it("rejects non-loopback endpoints and parses provider/model selections", () => {
    expect(() => new OpenCodeHttpClient({ baseUrl: "https://example.com", username: "p", password: "x" })).toThrow(/loopback/i);
    expect(parseModelSelection("openai/gpt-5:high")).toEqual({ providerID: "openai", modelID: "gpt-5", variant: "high" });
  });

  it("rejects an oversized JSON response before buffering its body", async () => {
    const client = new OpenCodeHttpClient({
      baseUrl: "http://127.0.0.1:40321",
      username: "p",
      password: "x",
      fetchImpl: async () => new Response("", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": String(9 * 1024 * 1024) },
      }),
    });
    await expect(client.health()).rejects.toThrow(/safety limit/i);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertMarkdownWebEmbedHref } from "../electron/main/markdown-web-embed-policy.mjs";

// --- Mock electron so the main-process service can be unit tested ---------

const capturedHandlers = { onBeforeRequest: null, willRedirect: null, willNavigate: null };

class FakeWebContents {
  constructor() {
    this.destroyed = false;
    this.session = {
      webRequest: {
        onBeforeRequest: (handler) => {
          capturedHandlers.onBeforeRequest = handler;
        },
      },
    };
  }
  setWindowOpenHandler() {}
  on(event, handler) {
    if (event === "will-redirect") capturedHandlers.willRedirect = handler;
    if (event === "will-navigate") capturedHandlers.willNavigate = handler;
  }
  async loadURL() {}
  destroy() {
    this.destroyed = true;
  }
}

class FakeWebContentsView {
  constructor() {
    this.webContents = new FakeWebContents();
    this.bounds = null;
  }
  setBounds(bounds) {
    this.bounds = bounds;
  }
}

vi.mock("electron", () => ({
  WebContentsView: FakeWebContentsView,
  session: {
    fromPartition: () => ({
      setPermissionRequestHandler: () => {},
      setPermissionCheckHandler: () => {},
      clearStorageData: async () => {},
    }),
  },
}));

const { createMarkdownWebEmbedService } = await import("../electron/main/markdown-web-embed-service.mjs");

function createFakeWindow() {
  const children = [];
  return {
    isDestroyed: () => false,
    contentView: {
      addChildView: (view) => children.push(view),
      removeChildView: (view) => {
        const index = children.indexOf(view);
        if (index >= 0) children.splice(index, 1);
      },
    },
    children,
  };
}

describe("Markdown web embed href policy", () => {
  it("allows only https embeds", () => {
    expect(assertMarkdownWebEmbedHref("https://example.com/x")).toBe("https://example.com/x");
    expect(() => assertMarkdownWebEmbedHref("file:///tmp/x.html")).toThrow(/https/i);
    expect(() => assertMarkdownWebEmbedHref("http://example.com")).toThrow(/https/i);
  });

  it("rejects credentialed and private embed targets", () => {
    expect(() => assertMarkdownWebEmbedHref("https://user:pass@example.com")).toThrow(/credentials/i);
    expect(() => assertMarkdownWebEmbedHref("https://127.0.0.1:3000")).toThrow(/private|loopback/i);
    expect(() => assertMarkdownWebEmbedHref("https://[::1]/")).toThrow(/private|loopback/i);
  });
});

describe("Markdown web embed service", () => {
  beforeEach(() => {
    capturedHandlers.onBeforeRequest = null;
    capturedHandlers.willRedirect = null;
    capturedHandlers.willNavigate = null;
  });

  it("denies data: and non-policy subresources in onBeforeRequest", async () => {
    const service = createMarkdownWebEmbedService({ getOwnerWindow: () => createFakeWindow() });
    await service.create({ href: "https://example.com/", bounds: {}, ownerWebContentsId: 1 });

    const decide = (url) => {
      let result = null;
      capturedHandlers.onBeforeRequest({ url }, (verdict) => { result = verdict; });
      return result;
    };

    expect(decide("data:image/png;base64,AAAA")).toEqual({ cancel: true });
    expect(decide("http://example.com/x")).toEqual({ cancel: true });
    expect(decide("https://127.0.0.1/x")).toEqual({ cancel: true });
    expect(decide("https://cdn.example.com/lib.js")).toEqual({});
  });

  it("cancels redirects to non-policy URLs", async () => {
    const service = createMarkdownWebEmbedService({ getOwnerWindow: () => createFakeWindow() });
    await service.create({ href: "https://example.com/", bounds: {}, ownerWebContentsId: 1 });
    expect(typeof capturedHandlers.willRedirect).toBe("function");

    const runRedirect = (url) => {
      let prevented = false;
      capturedHandlers.willRedirect({ preventDefault: () => { prevented = true; } }, url);
      return prevented;
    };

    expect(runRedirect("http://example.com/down")).toBe(true);
    expect(runRedirect("https://127.0.0.1/x")).toBe(true);
    expect(runRedirect("https://ok.example.com/next")).toBe(false);
  });

  it("rejects setBounds/destroy from a non-owner caller", async () => {
    const service = createMarkdownWebEmbedService({ getOwnerWindow: () => createFakeWindow() });
    const { id } = await service.create({ href: "https://example.com/", bounds: {}, ownerWebContentsId: 42 });

    expect(service.setBounds({ id, bounds: { x: 1, y: 1, width: 10, height: 10 }, callerWebContentsId: 99 })).toEqual({ ok: false });
    expect(service.destroy({ id, callerWebContentsId: 99 })).toEqual({ ok: false });
    // Owner may operate on it.
    expect(service.setBounds({ id, bounds: { x: 1, y: 1, width: 10, height: 10 }, callerWebContentsId: 42 })).toEqual({ ok: true });
    expect(service.destroy({ id, callerWebContentsId: 42 })).toEqual({ ok: true });
  });

  it("throws when the owner window is unavailable", async () => {
    const service = createMarkdownWebEmbedService({ getOwnerWindow: () => null });
    await expect(service.create({ href: "https://example.com/", bounds: {}, ownerWebContentsId: 7 })).rejects.toThrow(/owner window/i);
  });
});

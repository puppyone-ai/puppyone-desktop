import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  buildLocalFileCapabilityUrl,
  createLocalFileCapabilityStore,
} from "../electron/main/local-file-capabilities.mjs";
import {
  parseLocalFileUrl,
  registerLocalFileProtocol,
} from "../electron/main/local-file-protocol.mjs";

const ROOT = path.resolve("/workspace");

describe("local file capability store", () => {
  it("scopes opaque capabilities to one sender, root, and exact file path", () => {
    let sequence = 0;
    const store = createLocalFileCapabilityStore({
      createToken: () => `capability_${String(++sequence).padStart(40, "0")}`,
    });
    const token = store.issue({ senderId: 7, rootPath: ROOT, relativePath: "docs/report.docx" });

    expect(store.validate({ token, rootPath: ROOT, relativePath: "docs/report.docx" })).toBe(true);
    expect(store.validate({ token, rootPath: ROOT, relativePath: "docs/secret.txt" })).toBe(false);
    expect(store.validate({ token, rootPath: "/other", relativePath: "docs/report.docx" })).toBe(false);
    expect(store.issue({ senderId: 7, rootPath: ROOT, relativePath: "docs/report.docx" })).toBe(token);

    store.revokeSender(7);
    expect(store.validate({ token, rootPath: ROOT, relativePath: "docs/report.docx" })).toBe(false);
  });

  it("evicts the least-recently-used path capability per sender", () => {
    let sequence = 0;
    const store = createLocalFileCapabilityStore({
      createToken: () => `capability_${String(++sequence).padStart(40, "0")}`,
      maxCapabilitiesPerSender: 2,
    });
    const first = store.issue({ senderId: 1, rootPath: ROOT, relativePath: "a.txt" });
    const second = store.issue({ senderId: 1, rootPath: ROOT, relativePath: "b.txt" });
    store.issue({ senderId: 1, rootPath: ROOT, relativePath: "a.txt" });
    store.issue({ senderId: 1, rootPath: ROOT, relativePath: "c.txt" });

    expect(store.validate({ token: first, rootPath: ROOT, relativePath: "a.txt" })).toBe(true);
    expect(store.validate({ token: second, rootPath: ROOT, relativePath: "b.txt" })).toBe(false);
  });

  it("can scope an HTML capability to its directory so relative assets keep working", () => {
    const store = createLocalFileCapabilityStore();
    const token = store.issue({
      senderId: 2,
      rootPath: ROOT,
      relativePath: "site/index.html",
      scope: "directory",
    });
    const baseUrl = buildLocalFileCapabilityUrl({
      rootPath: ROOT,
      relativePath: "site/index.html",
      token,
    });
    const asset = parseLocalFileUrl(new URL("assets/app.css", baseUrl).toString());

    expect(asset.token).toBe(token);
    expect(asset.requestPath).toBe("assets/app.css");
    expect(store.resolve(asset)).toEqual({
      rootPath: ROOT,
      relativePath: "site/assets/app.css",
    });
    expect(store.resolve({ ...asset, requestPath: "../outside.txt" })).toBeNull();
  });

  it("issues unique, purpose-bound Markdown leases and hard-revokes by owner", () => {
    let sequence = 0;
    const store = createLocalFileCapabilityStore({
      createToken: () => `capability_${String(++sequence).padStart(40, "0")}`,
    });
    const request = {
      senderId: 7,
      rootPath: ROOT,
      relativePath: "images/a.png",
      purpose: "markdown-asset",
      reuse: false,
    };
    const first = store.issue(request);
    const second = store.issue(request);

    expect(second).not.toBe(first);
    expect(store.validate({
      token: first,
      rootPath: ROOT,
      relativePath: "images/a.png",
      purpose: "markdown-asset",
    })).toBe(true);
    expect(store.validate({
      token: first,
      rootPath: ROOT,
      relativePath: "images/a.png",
      purpose: "file-preview",
    })).toBe(false);
    expect(store.revoke({ token: first, senderId: 8 })).toBe(false);
    expect(store.revoke({ token: first, senderId: 7 })).toBe(true);
    expect(store.validate({
      token: first,
      rootPath: ROOT,
      relativePath: "images/a.png",
      purpose: "markdown-asset",
    })).toBe(false);
    expect(store.validate({
      token: second,
      rootPath: ROOT,
      relativePath: "images/a.png",
      purpose: "markdown-asset",
    })).toBe(true);
  });
});

describe("puppyone-local protocol capability enforcement", () => {
  it("serves only the exact capability path and never emits wildcard CORS", async () => {
    const store = createLocalFileCapabilityStore();
    const token = store.issue({ senderId: 9, rootPath: ROOT, relativePath: "report.xlsx" });
    const url = buildLocalFileCapabilityUrl({ rootPath: ROOT, relativePath: "report.xlsx", token });
    const { handler, readWorkspaceFile } = createProtocolHarness(store);

    const response = await handler(createRequest(url, "null"));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("null");
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(readWorkspaceFile).toHaveBeenCalledWith(ROOT, "report.xlsx", { rangeHeader: null });

    const changedPath = new URL(url);
    changedPath.pathname = changedPath.pathname.replace("report.xlsx", "secret.txt");
    expect((await handler(createRequest(changedPath.toString(), "null"))).status).toBe(403);
    const changedPurpose = new URL(url);
    changedPurpose.pathname = changedPurpose.pathname.replace("file-preview", "markdown-asset");
    expect((await handler(createRequest(changedPurpose.toString(), "null"))).status).toBe(403);
    expect((await handler(createRequest(url.replace(token, "invalid"), "null"))).status).toBe(403);
  });

  it("rejects an external web origin even when it presents a valid token", async () => {
    const store = createLocalFileCapabilityStore();
    const token = store.issue({ senderId: 9, rootPath: ROOT, relativePath: "report.xlsx" });
    const url = buildLocalFileCapabilityUrl({ rootPath: ROOT, relativePath: "report.xlsx", token });
    const { handler, readWorkspaceFile } = createProtocolHarness(store);

    const response = await handler(createRequest(url, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });

  it("round-trips the token through the canonical URL parser", () => {
    const token = "a".repeat(43);
    const url = buildLocalFileCapabilityUrl({
      rootPath: "/Users/example/My Workspace",
      relativePath: "docs/Q3 report.xlsx",
      token,
    });
    expect(decodeURIComponent(url)).not.toContain("/Users/example/My Workspace");
    expect(decodeURIComponent(url)).not.toContain("docs/");
    expect(parseLocalFileUrl(url)).toEqual({
      requestPath: "Q3 report.xlsx",
      token,
      purpose: "file-preview",
    });
  });

  it("rejects lookalike schemes and non-canonical URL adornments", () => {
    const token = "z".repeat(43);
    const canonical = buildLocalFileCapabilityUrl({
      relativePath: "docs/plan.md",
      token,
      purpose: "markdown-asset",
    });

    expect(() => parseLocalFileUrl(canonical.replace("puppyone-local:", "https:"))).toThrow();
    expect(() => parseLocalFileUrl(`${canonical}?download=1`)).toThrow();
    expect(() => parseLocalFileUrl(`${canonical}#fragment`)).toThrow();
  });
});

function createProtocolHarness(store) {
  let handler = null;
  const protocol = {
    handle: vi.fn((_scheme, nextHandler) => {
      handler = nextHandler;
    }),
  };
  const readWorkspaceFile = vi.fn(async () => Buffer.from([1, 2, 3]));
  registerLocalFileProtocol({
    protocol,
    readWorkspaceFile,
    getMimeType: () => "application/octet-stream",
    canonicalizeWorkspacePath: async (value) => value,
    isOpenWorkspaceRoot: () => true,
    resolveCapability: store.resolve,
    applicationUrl: "file:///Applications/puppyone/dist/index.html",
  });
  if (!handler) throw new Error("Protocol handler was not registered.");
  return { handler, readWorkspaceFile };
}

function createRequest(url, origin) {
  return {
    url,
    method: "GET",
    headers: new Headers(origin ? { Origin: origin } : {}),
  };
}

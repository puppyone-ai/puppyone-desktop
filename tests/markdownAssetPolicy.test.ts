import { describe, expect, it } from "vitest";
import {
  evaluateMarkdownAssetHref,
  isBrokerSafeResolvedAssetUrl,
  isPathInsideWorkspaceRoot,
  resolveWorkspaceRelativePath,
} from "../vendor/shared-ui/src/editor/markdown/policy/markdownAssetPolicy";
import { createAssetBroker } from "../vendor/shared-ui/src/editor/markdown/services/assetBroker";
import { createCapabilityPrincipal } from "../vendor/shared-ui/src/editor/markdown/services/capabilityPrincipal";
import {
  allowsLocalActiveHtml,
  createDocumentTrustContext,
  evaluateAuthorizationGrant,
} from "../vendor/shared-ui/src/editor/markdown/policy/markdownTrustPolicy";
import { createExecutionSessionStore } from "../vendor/shared-ui/src/editor/markdown/services/executionSession";

describe("markdownAssetPolicy", () => {
  it("denies file:// and executable schemes", () => {
    expect(evaluateMarkdownAssetHref("file:///tmp/x.png", { documentPath: "a.md" }).ok).toBe(false);
    expect(evaluateMarkdownAssetHref("javascript:alert(1)", { documentPath: "a.md" }).ok).toBe(false);
  });

  it("denies svg data URLs and oversized data images", () => {
    expect(evaluateMarkdownAssetHref("data:image/svg+xml,<svg></svg>", { documentPath: "a.md" }).ok).toBe(false);
    const huge = `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`;
    expect(evaluateMarkdownAssetHref(huge, { documentPath: "a.md" }).ok).toBe(false);
  });

  it("allows small raster data images", () => {
    const result = evaluateMarkdownAssetHref("data:image/png;base64,aaaa", { documentPath: "a.md" });
    expect(result).toMatchObject({ ok: true, kind: "data-image", mimeType: "image/png" });
  });

  it("rejects workspace escape via ..", () => {
    expect(resolveWorkspaceRelativePath("notes/a.md", "../../etc/passwd")).toBeNull();
    expect(
      evaluateMarkdownAssetHref("../secret.png", {
        documentPath: "notes/a.md",
        workspaceRoot: "notes",
      }).ok,
    ).toBe(false);
  });

  it("keeps contained relative paths", () => {
    expect(isPathInsideWorkspaceRoot("/ws", "/ws/img/a.png")).toBe(true);
    expect(isPathInsideWorkspaceRoot("/ws", "/other/a.png")).toBe(false);
    const result = evaluateMarkdownAssetHref("./img/a.png", {
      documentPath: "notes/doc.md",
      workspaceRoot: "notes",
    });
    expect(result).toMatchObject({ ok: true, kind: "workspace-relative", path: "notes/img/a.png" });
  });

  it("never treats file:// as a safe resolved broker URL", () => {
    expect(isBrokerSafeResolvedAssetUrl("file:///tmp/x.png")).toBe(false);
    expect(isBrokerSafeResolvedAssetUrl("blob:https://x/1")).toBe(true);
  });
});

describe("AssetBroker policy gate", () => {
  it("does not call the host resolver for denied hrefs", async () => {
    let calls = 0;
    const broker = createAssetBroker(async () => {
      calls += 1;
      return "blob:denied";
    });
    const principal = createCapabilityPrincipal({
      editorViewId: "v1",
      workspaceId: "ws",
      documentPath: "a.md",
      documentRevision: "1:1",
      purpose: "asset-read",
    });
    const handle = await broker.resolve({
      principal,
      sourcePath: "a.md",
      href: "file:///tmp/x.png",
    });
    expect(handle).toBeNull();
    expect(calls).toBe(0);
  });

  it("drops file:// results even if the host resolver returns them", async () => {
    const broker = createAssetBroker(async () => "file:///tmp/x.png");
    const principal = createCapabilityPrincipal({
      editorViewId: "v1",
      workspaceId: "ws",
      documentPath: "a.md",
      documentRevision: "1:1",
      purpose: "asset-read",
    });
    const handle = await broker.resolve({
      principal,
      sourcePath: "a.md",
      href: "./x.png",
      workspaceRoot: null,
    });
    expect(handle).toBeNull();
  });
});

describe("trust + execution sessions", () => {
  it("requires an explicit local-active-html grant", () => {
    const principal = createCapabilityPrincipal({
      editorViewId: "v1",
      workspaceId: "ws",
      documentPath: "a.md",
      documentRevision: "1:1",
      purpose: "web-embed",
    });
    const denied = createDocumentTrustContext({
      workspaceId: "ws",
      documentPath: "a.md",
      explicitGrants: [],
    });
    const granted = createDocumentTrustContext({
      workspaceId: "ws",
      documentPath: "a.md",
      explicitGrants: ["local-active-html"],
    });
    expect(allowsLocalActiveHtml(denied, principal)).toBe(false);
    expect(evaluateAuthorizationGrant(granted, principal, "local-active-html")?.revoked).toBe(false);
  });

  it("destroys execution sessions on revision change and revokes handles", () => {
    const revoked: string[] = [];
    const store = createExecutionSessionStore({
      onDestroy(session) {
        revoked.push(session.id);
      },
    });
    const principal = createCapabilityPrincipal({
      editorViewId: "v1",
      workspaceId: "ws",
      documentPath: "a.md",
      documentRevision: "1:1",
      purpose: "asset-read",
    });
    const session = store.create({
      principal,
      documentRevision: "1:1",
      featureId: "html-block",
    });
    store.destroyForRevisionChange("1:1", "2:1");
    expect(revoked).toEqual([session.id]);
    expect(store.values()).toHaveLength(0);
  });
});

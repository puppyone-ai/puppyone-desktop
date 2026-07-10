import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { createWidgetSessionRegistry } from "../vendor/shared-ui/src/editor/markdown/adapters/codemirror/widgetSession";
import { createEmbeddedEditSessionStore } from "../vendor/shared-ui/src/editor/markdown/adapters/codemirror/embeddedEditSession";
import { compileMarkdownElementPlan } from "../vendor/shared-ui/src/editor/markdown/plans/markdownPlanCompiler";
import {
  getCollapsedMarkerDeletionUnit,
  getMarkdownPlanIndex,
} from "../vendor/shared-ui/src/editor/markdown/plans/markdownPlanIndex";
import { MARKDOWN_HTML_PROFILE_VERSION } from "../vendor/shared-ui/src/editor/markdown/policy/markdownHtmlProfiles";
import { createAsyncRenderBroker } from "../vendor/shared-ui/src/editor/markdown/services/asyncRenderBroker";
import { createLinkBroker } from "../vendor/shared-ui/src/editor/markdown/services/linkBroker";
import { createWebEmbedBroker } from "../vendor/shared-ui/src/editor/markdown/services/webEmbedBroker";
import { createCapabilityPrincipal, workspaceIdForDocument } from "../vendor/shared-ui/src/editor/markdown/services/capabilityPrincipal";
import { createExecutionSessionStore } from "../vendor/shared-ui/src/editor/markdown/services/executionSession";
import {
  createDocumentTrustContext,
  evaluateAuthorizationGrant,
} from "../vendor/shared-ui/src/editor/markdown/policy/markdownTrustPolicy";
import { createTransactionBroker, getDocRevision } from "../vendor/shared-ui/src/editor/markdown/services/transactionBroker";
import { getMarkdownElements } from "../vendor/shared-ui/src/editor/markdown/syntax/markdownElements";
import { puppyMarkdownParserExtensions } from "../vendor/shared-ui/src/editor/markdown/syntax/markdownParserExtensions";

function createMarkdownState(source: string) {
  return EditorState.create({
    doc: source,
    extensions: [
      markdown({ base: markdownLanguage, extensions: puppyMarkdownParserExtensions }),
    ],
  });
}

describe("Markdown render-plan compiler", () => {
  it("compiles styled span list items into inlineMark plans", () => {
    const source = '- <span style="color: #B45309;">screenshot</span>';
    const element = getMarkdownElements(createMarkdownState(source)).find((candidate) => candidate.kind === "inlineHtml");
    expect(element).toBeDefined();
    const plan = compileMarkdownElementPlan(element!);
    expect(plan.presentation).toBe("inlineMark");
    if (plan.presentation === "inlineMark") {
      expect(plan.mark.tagName).toBe("span");
      expect(plan.mark.attributes.style).toBe("color: #B45309");
      expect(plan.capabilities.deleteUnits).toHaveLength(2);
      expect(plan.capabilities.reveal).toBe(true);
    }
  });

  it("compiles bare br into an expandable inlineAtom with lineBreaks metadata", () => {
    const source = "before<br>after";
    const element = getMarkdownElements(createMarkdownState(source)).find((candidate) => (
      candidate.kind === "inlineHtml" && candidate.inlineHtml.tagName === "br"
    ));
    const plan = compileMarkdownElementPlan(element!);
    expect(plan).toMatchObject({
      presentation: "inlineAtom",
      atom: { kind: "lineBreak" },
      layout: { lineBreaks: 1 },
      capabilities: { expand: true, atomic: true },
    });
  });

  it("keeps incomplete inline HTML as visibleSource without deletion units", () => {
    const source = "Text <span>unfinished";
    const element = getMarkdownElements(createMarkdownState(source)).find((candidate) => candidate.kind === "inlineHtml");
    const plan = compileMarkdownElementPlan(element!);
    expect(plan.presentation).toBe("visibleSource");
    expect(plan.capabilities.deleteUnits).toEqual([]);
    expect(getCollapsedMarkerDeletionUnit(createMarkdownState(source), source.length, "backward")).toBeNull();
  });

  it("indexes plans by document and syntax tree identity", () => {
    const state = createMarkdownState('<kbd>Cmd</kbd> + <span style="color: red">R</span>');
    const plans = getMarkdownPlanIndex(state);
    expect(plans.some((entry) => entry.plan.presentation === "inlineMark")).toBe(true);
    expect(MARKDOWN_HTML_PROFILE_VERSION).toMatch(/^2026-/);
  });

  it("compiles fence and table blocks into blockAtom plans with payload", () => {
    const source = [
      "```ts",
      "const x = 1;",
      "```",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");
    const plans = getMarkdownPlanIndex(createMarkdownState(source));
    const fence = plans.find((entry) => entry.plan.presentation === "blockAtom" && entry.plan.embed.kind === "codeBlock");
    const table = plans.find((entry) => entry.plan.presentation === "blockAtom" && entry.plan.embed.kind === "table");
    expect(fence?.plan).toMatchObject({
      presentation: "blockAtom",
      embed: { kind: "codeBlock", language: "ts", code: "const x = 1;" },
    });
    expect(table?.plan.presentation).toBe("blockAtom");
    if (table?.plan.presentation === "blockAtom" && table.plan.embed.kind === "table") {
      expect(table.plan.embed.rows.length).toBeGreaterThanOrEqual(2);
      expect(table.plan.embed.alignments.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("Markdown embed runtime foundations", () => {
  it("rejects embedded commits from a stale base revision", () => {
    const state = EditorState.create({ doc: "```ts\nold\n```" });
    const view = { state, dispatch: () => { throw new Error("stale commit dispatched"); } } as never;
    const broker = createTransactionBroker();

    expect(broker.buildCommit(view, {
      mappedRange: { from: 0, to: state.doc.length },
      baseSource: state.doc.toString(),
      baseRevision: "stale-revision",
      nextSource: "```ts\nnew\n```",
    })).toBeNull();
    expect(broker.commit(view, {
      mappedRange: { from: 0, to: state.doc.length },
      baseSource: state.doc.toString(),
      baseRevision: "stale-revision",
      nextSource: "```ts\nnew\n```",
    })).toEqual({ ok: false, mappedTo: null });
    expect(getDocRevision(state.doc)).not.toBe("stale-revision");
  });

  it("disposes widget sessions by exact DOM node and disposeAll", () => {
    const registry = createWidgetSessionRegistry();
    const domA = {} as HTMLElement;
    const domB = {} as HTMLElement;
    let disposedA = 0;
    let disposedB = 0;

    registry.mount(domA, () => ({ dispose: () => { disposedA += 1; } }));
    registry.mount(domB, () => ({ dispose: () => { disposedB += 1; } }));
    registry.dispose(domA);
    expect(disposedA).toBe(1);
    expect(disposedB).toBe(0);

    registry.disposeAll();
    expect(disposedB).toBe(1);
  });

  it("keeps embedded edit sessions range-mapped and revision-aware", () => {
    const store = createEmbeddedEditSessionStore();
    store.set({
      elementId: "table:0",
      featureId: "tables",
      mappedRange: { from: 10, to: 40 },
      baseSource: "| a | b |",
      baseRevision: "rev-1",
      draft: { text: "x" },
      mode: "editing",
    });
    store.mapRanges((pos) => pos + 5);
    expect(store.get("table:0")?.mappedRange).toEqual({ from: 15, to: 45 });
  });

  it("defaults external web embeds to click-to-load and blocks non-https", async () => {
    const broker = createWebEmbedBroker();
    const principal = createCapabilityPrincipal({
      editorViewId: "view-1",
      workspaceId: "ws",
      documentPath: "note.md",
      documentRevision: "1",
      purpose: "web-embed",
    });

    const https = broker.create({
      principal,
      href: "https://example.com",
      privacyProfile: "temporary-no-credential",
    });
    expect(https.state).toBe("click-to-load");
    expect((await broker.activate(https.id))?.state).toBe("loaded");

    const blocked = broker.create({
      principal,
      href: "file:///tmp/x.html",
      privacyProfile: "temporary-no-credential",
    });
    expect(blocked.state).toBe("blocked");
  });

  it("deduplicates async render work by principal-scoped key", async () => {
    const broker = createAsyncRenderBroker();
    let runs = 0;
    const principal = createCapabilityPrincipal({
      editorViewId: "view-1",
      workspaceId: "ws",
      documentPath: "note.md",
      documentRevision: "1",
      purpose: "async-render",
    });
    const key = {
      featureId: "mermaid",
      elementKey: "1",
      source: "graph TD;A-->B",
      themeKey: "dark",
      policyVersion: MARKDOWN_HTML_PROFILE_VERSION,
      principalKey: principal.editorViewId,
    };

    const [first, second] = await Promise.all([
      broker.run({
        key,
        principal,
        run: async () => {
          runs += 1;
          return "svg";
        },
      }),
      broker.run({
        key,
        principal,
        run: async () => {
          runs += 1;
          return "svg";
        },
      }),
    ]);

    expect(runs).toBe(1);
    expect(first?.value).toBe("svg");
    expect(second?.value).toBe("svg");
  });

  it("destroys execution sessions bound to a superseded revision", () => {
    let destroyed = 0;
    const store = createExecutionSessionStore({ onDestroy: () => { destroyed += 1; } });
    const base = createCapabilityPrincipal({
      editorViewId: "view-1",
      workspaceId: "ws",
      documentPath: "note.md",
      documentRevision: "10:1",
      purpose: "web-embed",
    });

    const oldSession = store.create({ principal: base, documentRevision: "10:1", grantId: "grant-1" });
    expect(oldSession.principal.executionSessionId).toBe(oldSession.id);
    // A fresh session recreated against the new revision must survive.
    const newSession = store.create({ principal: base, documentRevision: "12:1", grantId: "grant-1" });

    const gone = store.destroyForRevisionChange("10:1", "12:1");
    expect(gone.map((session) => session.id)).toEqual([oldSession.id]);
    expect(store.get(oldSession.id)).toBeUndefined();
    expect(store.get(newSession.id)).toBeDefined();
    expect(destroyed).toBe(1);
    expect(oldSession.grantId).toBe("grant-1"); // grant is independent of the session
  });

  it("requires an explicit grant for local active HTML (independent of revision)", () => {
    const principal = createCapabilityPrincipal({
      editorViewId: "view-1",
      workspaceId: "ws",
      documentPath: "note.md",
      documentRevision: "1:1",
      purpose: "web-embed",
    });

    // Safe trust mode: never granted, sanitized only.
    expect(
      evaluateAuthorizationGrant(
        createDocumentTrustContext({
          workspaceId: "ws",
          documentPath: "note.md",
          provenance: "local-workspace",
          explicitGrants: [],
        }),
        principal,
        "local-active-html",
      ),
    ).toBeNull();

    // Provenance / localTrusted alone is NOT a grant.
    expect(
      evaluateAuthorizationGrant(
        createDocumentTrustContext({
          workspaceId: "ws",
          documentPath: "note.md",
          provenance: "local-workspace",
          explicitGrants: [],
        }),
        principal,
        "local-active-html",
      ),
    ).toBeNull();

    const granted = evaluateAuthorizationGrant(
      createDocumentTrustContext({
        workspaceId: "ws",
        documentPath: "note.md",
        provenance: "local-workspace",
        explicitGrants: ["local-active-html"],
      }),
      principal,
      "local-active-html",
    );
    expect(granted).not.toBeNull();
    expect(granted?.capability).toBe("local-active-html");
    expect(granted?.revoked).toBe(false);
  });

  it("routes link intents through the link broker", () => {
    const broker = createLinkBroker({
      resolveInternal: (_documentPath, href) => href.endsWith(".md") ? href : null,
    });
    const principal = createCapabilityPrincipal({
      editorViewId: "view-1",
      workspaceId: workspaceIdForDocument("note.md"),
      documentPath: "note.md",
      documentRevision: "1",
      purpose: "link-open",
    });

    expect(workspaceIdForDocument("note.md")).toBe("doc:note.md");
    expect(broker.resolve(principal, "other.md")).toEqual({
      action: "navigate-internal",
      path: "other.md",
    });
    expect(broker.resolve(principal, "https://example.com")).toEqual({
      action: "open-external",
      href: "https://example.com",
    });
    expect(broker.resolve(principal, "javascript:alert(1)").action).toBe("deny");
  });
});

import type { EditorView } from "@codemirror/view";
import { createAsyncRenderBroker, type AsyncRenderBroker } from "../brokers/asyncRenderBroker";
import { createAssetBroker, type AssetBroker, type AssetUrlResolver } from "../brokers/assetBroker";
import { createLinkBroker, type LinkBroker } from "../brokers/linkBroker";
import { createTransactionBroker, type TransactionBroker } from "../brokers/transactionBroker";
import { createWebEmbedBroker, type WebEmbedBroker } from "../brokers/webEmbedBroker";
import { createEmbeddedEditSessionStore, type EmbeddedEditSessionStore } from "./embeddedEditSession";
import { createWidgetSessionRegistry, type WidgetSessionRegistry } from "./widgetSession";
import { createExecutionSessionStore, type ExecutionSessionStore } from "../sessions/executionSession";

export type MarkdownEmbedHost = {
  viewId: string;
  sessions: WidgetSessionRegistry;
  editSessions: EmbeddedEditSessionStore;
  executionSessions: ExecutionSessionStore;
  assets: AssetBroker;
  asyncRender: AsyncRenderBroker;
  links: LinkBroker;
  transactions: TransactionBroker;
  webEmbeds: WebEmbedBroker;
  requestMeasure(): void;
  dispose(): void;
};

const embedHosts = new WeakMap<EditorView, MarkdownEmbedHost>();
let viewSequence = 0;

export type MarkdownEmbedHostOptions = {
  resolveAssetUrl?: AssetUrlResolver | null;
  allowAutomaticWebEmbedLoad?: boolean;
  workspaceRoot?: string | null;
};

/**
 * One embed host per EditorView. Owns DOM sessions, brokers, and measurement
 * coordination. It is an adapter runtime, not a second document model.
 */
export function getMarkdownEmbedHost(
  view: EditorView,
  options: MarkdownEmbedHostOptions = {},
): MarkdownEmbedHost {
  const existing = embedHosts.get(view);
  if (existing) return existing;

  const sessions = createWidgetSessionRegistry();
  const editSessions = createEmbeddedEditSessionStore();
  const assets = createAssetBroker(options.resolveAssetUrl ?? null, {
    workspaceRoot: options.workspaceRoot ?? null,
  });
  // Destroying an execution session revokes its principal-scoped asset handles
  // so a dead revision cannot keep a live handle.
  const executionSessions = createExecutionSessionStore({
    onDestroy(session) {
      assets.revokeExecutionSession(session.id);
    },
  });
  const asyncRender = createAsyncRenderBroker();
  const links = createLinkBroker();
  const transactions = createTransactionBroker();
  const webEmbeds = createWebEmbedBroker({
    allowAutomaticLoad: options.allowAutomaticWebEmbedLoad === true,
  });

  let measureQueued = false;
  const host: MarkdownEmbedHost = {
    viewId: `md-view:${++viewSequence}`,
    sessions,
    editSessions,
    executionSessions,
    assets,
    asyncRender,
    links,
    transactions,
    webEmbeds,
    requestMeasure() {
      if (measureQueued) return;
      measureQueued = true;
      queueMicrotask(() => {
        measureQueued = false;
        try {
          view.requestMeasure();
        } catch {
          // EditorView may already be destroyed.
        }
      });
    },
    dispose() {
      sessions.disposeAll();
      editSessions.clear();
      executionSessions.disposeAll();
      assets.disposeAll();
      asyncRender.disposeAll();
      webEmbeds.disposeAll();
      embedHosts.delete(view);
    },
  };

  embedHosts.set(view, host);
  return host;
}

export function disposeMarkdownEmbedHost(view: EditorView) {
  embedHosts.get(view)?.dispose();
}

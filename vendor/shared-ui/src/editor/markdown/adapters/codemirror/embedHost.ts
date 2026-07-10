import type { EditorView } from "@codemirror/view";
import { createAsyncRenderBroker, type AsyncRenderBroker } from "../../services/asyncRenderBroker";
import { createAssetBroker, type AssetBroker, type AssetUrlResolver } from "../../services/assetBroker";
import { createLinkBroker, type LinkBroker } from "../../services/linkBroker";
import { createTransactionBroker, type TransactionBroker } from "../../services/transactionBroker";
import { createWebEmbedBroker, type WebEmbedBroker } from "../../services/webEmbedBroker";
import { createWidgetSessionRegistry, type WidgetSessionRegistry } from "./widgetSession";

export type MarkdownEmbedHost = {
  viewId: string;
  sessions: WidgetSessionRegistry;
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
  const assets = createAssetBroker(options.resolveAssetUrl ?? null);
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

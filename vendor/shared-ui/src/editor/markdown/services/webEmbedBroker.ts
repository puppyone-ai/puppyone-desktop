import type { CapabilityPrincipal } from "./capabilityPrincipal";

export type WebEmbedRequest = {
  principal: CapabilityPrincipal;
  href: string;
  privacyProfile: "temporary-no-credential";
};

export type WebEmbedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WebEmbedSession = {
  id: string;
  href: string;
  state: "blocked" | "click-to-load" | "loading" | "loaded" | "destroyed";
  nativeViewId?: string;
  destroy(): void;
};

export type MarkdownWebEmbedBridge = {
  create(request: { href: string; bounds?: WebEmbedBounds }): Promise<{ id: string }>;
  setBounds(request: { id: string; bounds: WebEmbedBounds }): Promise<void>;
  destroy(request: { id: string }): Promise<void>;
};

function getDesktopWebEmbedBridge(): MarkdownWebEmbedBridge | null {
  const desktop = (globalThis as { puppyoneDesktop?: { markdownWebEmbed?: MarkdownWebEmbedBridge } }).puppyoneDesktop;
  return desktop?.markdownWebEmbed ?? null;
}

/**
 * External https embeds are realized by the main process via WebContentsView.
 * Markdown widgets never create authority-bearing browser surfaces directly.
 * Default policy: blocked / click-to-load.
 */
export function createWebEmbedBroker(options: {
  allowAutomaticLoad?: boolean;
} = {}) {
  const sessions = new Map<string, WebEmbedSession>();
  let sequence = 0;

  const destroySession = (session: WebEmbedSession) => {
    if (session.state === "destroyed") return;
    session.state = "destroyed";
    const bridge = getDesktopWebEmbedBridge();
    if (session.nativeViewId && bridge) {
      void bridge.destroy({ id: session.nativeViewId }).catch(() => undefined);
    }
    sessions.delete(session.id);
  };

  return {
    create(request: WebEmbedRequest): WebEmbedSession {
      if (!/^https:\/\//i.test(request.href)) {
        const denied: WebEmbedSession = {
          id: `web-embed-denied:${++sequence}`,
          href: request.href,
          state: "blocked",
          destroy() {
            destroySession(denied);
          },
        };
        sessions.set(denied.id, denied);
        return denied;
      }

      const id = `web-embed:${++sequence}`;
      const session: WebEmbedSession = {
        id,
        href: request.href,
        state: options.allowAutomaticLoad ? "loading" : "click-to-load",
        destroy() {
          destroySession(session);
        },
      };
      sessions.set(id, session);

      if (options.allowAutomaticLoad) {
        void this.activate(id);
      }
      return session;
    },

    async activate(sessionId: string, bounds?: WebEmbedBounds): Promise<WebEmbedSession | null> {
      const session = sessions.get(sessionId);
      if (!session || session.state === "destroyed" || session.state === "blocked") return null;
      session.state = "loading";

      const bridge = getDesktopWebEmbedBridge();
      if (!bridge) {
        // Browser/dev without Electron: mark loaded for UI placeholder only.
        session.state = "loaded";
        return session;
      }

      try {
        const created = await bridge.create({ href: session.href, bounds });
        const current = sessions.get(sessionId);
        if (!current || current.state === "destroyed") {
          await bridge.destroy({ id: created.id }).catch(() => undefined);
          return null;
        }
        current.nativeViewId = created.id;
        current.state = "loaded";
        return current;
      } catch {
        const current = sessions.get(sessionId);
        if (current && current.state !== "destroyed") current.state = "click-to-load";
        return current ?? null;
      }
    },

    async setBounds(sessionId: string, bounds: WebEmbedBounds): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session?.nativeViewId) return;
      const bridge = getDesktopWebEmbedBridge();
      if (!bridge) return;
      await bridge.setBounds({ id: session.nativeViewId, bounds }).catch(() => undefined);
    },

    destroy(sessionId: string) {
      const session = sessions.get(sessionId);
      if (session) destroySession(session);
    },

    disposeAll() {
      for (const session of Array.from(sessions.values())) destroySession(session);
      sessions.clear();
    },
  };
}

export type WebEmbedBroker = ReturnType<typeof createWebEmbedBroker>;

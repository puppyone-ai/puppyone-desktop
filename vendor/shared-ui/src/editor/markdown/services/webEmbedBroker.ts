import type { CapabilityPrincipal } from "./capabilityPrincipal";

export type WebEmbedRequest = {
  principal: CapabilityPrincipal;
  href: string;
  privacyProfile: "temporary-no-credential";
};

export type WebEmbedSession = {
  id: string;
  href: string;
  state: "blocked" | "click-to-load" | "loading" | "loaded" | "destroyed";
  destroy(): void;
};

/**
 * External https embeds are realized by the main process. Markdown widgets
 * never create authority-bearing browser surfaces directly.
 *
 * Default policy: blocked / click-to-load. This renderer-side broker only
 * tracks intent and session lifecycle until Electron wiring lands.
 */
export function createWebEmbedBroker(options: {
  allowAutomaticLoad?: boolean;
} = {}) {
  const sessions = new Map<string, WebEmbedSession>();
  let sequence = 0;

  return {
    create(request: WebEmbedRequest): WebEmbedSession {
      if (!/^https:\/\//i.test(request.href)) {
        const denied: WebEmbedSession = {
          id: `web-embed-denied:${++sequence}`,
          href: request.href,
          state: "blocked",
          destroy() {
            sessions.delete(denied.id);
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
          session.state = "destroyed";
          sessions.delete(id);
        },
      };
      sessions.set(id, session);
      return session;
    },

    activate(sessionId: string): WebEmbedSession | null {
      const session = sessions.get(sessionId);
      if (!session || session.state === "destroyed" || session.state === "blocked") return null;
      session.state = "loading";
      // Main-process WebContents attachment is a later Electron integration step.
      session.state = "loaded";
      return session;
    },

    disposeAll() {
      for (const session of sessions.values()) session.destroy();
      sessions.clear();
    },
  };
}

export type WebEmbedBroker = ReturnType<typeof createWebEmbedBroker>;

import { isSafeHref } from "../policy/markdownUrlPolicy";
import type { CapabilityPrincipal } from "./capabilityPrincipal";

export type LinkIntent =
  | { kind: "internal"; path: string }
  | { kind: "external"; href: string }
  | { kind: "denied"; reason: string };

export type LinkBrokerResult =
  | { action: "navigate-internal"; path: string }
  | { action: "open-external"; href: string }
  | { action: "confirm-external"; href: string }
  | { action: "deny"; reason: string };

export type LinkBrokerOptions = {
  resolveInternal?: (documentPath: string, href: string) => string | null;
  requireExternalConfirmation?: boolean;
};

/**
 * Converts a typed link intent into controlled navigation. Adapters never open
 * ambient browser windows from raw href attributes.
 */
export function createLinkBroker(options: LinkBrokerOptions = {}) {
  return {
    resolve(
      principal: CapabilityPrincipal,
      href: string,
    ): LinkBrokerResult {
      void principal;
      const trimmed = href.trim();
      if (!trimmed) return { action: "deny", reason: "empty-href" };
      if (!isSafeHref(trimmed)) return { action: "deny", reason: "unsafe-protocol" };

      const internal = options.resolveInternal?.(principal.documentPath, trimmed) ?? null;
      if (internal) return { action: "navigate-internal", path: internal };

      // Relative markdown paths without scheme are internal candidates when
      // resolveInternal is absent — still require an explicit resolver for
      // navigation; otherwise deny ambient opens.
      if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith("#") && !trimmed.startsWith("/")) {
        if (options.resolveInternal) {
          return { action: "deny", reason: "unresolved-internal" };
        }
      }

      if (/^https?:/i.test(trimmed) || /^mailto:/i.test(trimmed)) {
        if (options.requireExternalConfirmation) {
          return { action: "confirm-external", href: trimmed };
        }
        return { action: "open-external", href: trimmed };
      }

      return { action: "deny", reason: "unresolved" };
    },
  };
}

export type LinkBroker = ReturnType<typeof createLinkBroker>;

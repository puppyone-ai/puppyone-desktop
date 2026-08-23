import { randomUUID } from "node:crypto";

/**
 * Keeps renderer-visible paths separate from the authority to create there.
 * Grants are bound to the exact WebContents object and only the latest Browse
 * selection remains valid for a window.
 */
export function createProjectLocationGrantStore({ createId = randomUUID } = {}) {
  const grantBySender = new WeakMap();

  return Object.freeze({
    issue(sender, canonicalPath) {
      requireSender(sender);
      if (typeof canonicalPath !== "string" || !canonicalPath.trim()) {
        throw new Error("A canonical project location is required.");
      }
      const grant = Object.freeze({
        grantId: createId(),
        path: canonicalPath,
      });
      grantBySender.set(sender, grant);
      return grant;
    },

    resolve(sender, grantId) {
      requireSender(sender);
      const grant = grantBySender.get(sender);
      if (typeof grantId !== "string" || !grantId || grant?.grantId !== grantId) {
        throw new Error("Choose a project location before creating the project.");
      }
      return grant.path;
    },

    revoke(sender, grantId) {
      requireSender(sender);
      const grant = grantBySender.get(sender);
      if (!grant || grant.grantId !== grantId) return false;
      grantBySender.delete(sender);
      return true;
    },
  });
}

function requireSender(sender) {
  if ((typeof sender !== "object" && typeof sender !== "function") || sender === null) {
    throw new Error("No active window is available for this project location.");
  }
}

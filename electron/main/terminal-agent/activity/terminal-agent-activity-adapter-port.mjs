/**
 * Runtime guard for the provider edge port. Raw provider shapes terminate in
 * an adapter; only `normalize(projectedPayload, context)` crosses inward.
 */
export function assertTerminalAgentActivityAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Terminal Agent activity adapter is required.");
  }
  if (typeof adapter.providerId !== "string" || !/^[a-z][a-z0-9-]{0,39}$/u.test(adapter.providerId)) {
    throw new TypeError("Terminal Agent activity adapter provider id is invalid.");
  }
  if (typeof adapter.displayName !== "string" || !adapter.displayName.trim()) {
    throw new TypeError(`Terminal Agent activity adapter ${adapter.providerId} requires a display name.`);
  }
  if (typeof adapter.normalize !== "function") {
    throw new TypeError(`Terminal Agent activity adapter ${adapter.providerId} requires normalize().`);
  }
  return adapter;
}

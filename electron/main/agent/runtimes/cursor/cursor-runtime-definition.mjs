import { createCursorDiscovery } from "./cursor-discovery.mjs";

export const CURSOR_RUNTIME_DESCRIPTOR = Object.freeze({
  id: "cursor",
  displayName: "Cursor Agent",
  description: "The user's Cursor Agent; visible for diagnostics and capability-gated until a stable native protocol is supported.",
  kind: "native-cli",
  iconKey: "cursor",
  priority: 20,
  distribution: "user-installed",
});

export function createCursorRuntimeDefinition({ discovery = createCursorDiscovery() } = {}) {
  return {
    descriptor: CURSOR_RUNTIME_DESCRIPTOR,
    discovery,
    createAdapter: () => {
      throw new Error("Cursor Agent cannot start because its native protocol is not supported by this PuppyOne build.");
    },
  };
}

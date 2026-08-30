import type { AuxiliaryWorkbenchCreationRecipe } from "./types";

/**
 * The managed Harness remains registered in the runtime layer, but it is not a
 * customer-facing creation option until PuppyOne Agent is ready to ship.
 */
export const PUPPYONE_AGENT_CREATION_RECIPE = Object.freeze({
  id: "puppyone-agent",
  label: "PuppyOne",
  iconKey: "puppyone-agent",
  status: "coming-soon",
} as const satisfies AuxiliaryWorkbenchCreationRecipe);

/** Composition-owned product order for recipes currently exposed in the launcher. */
export const AGENT_CHAT_CREATION_RECIPES = Object.freeze([
  Object.freeze({ id: "codex", label: "Codex", iconKey: "codex", status: "available" }),
  Object.freeze({ id: "claude", label: "Claude Code", iconKey: "claude", status: "available" }),
  Object.freeze({ id: "cursor", label: "Cursor", iconKey: "cursor", status: "available" }),
  Object.freeze({ id: "opencode-native", label: "OpenCode", iconKey: "opencode", status: "available" }),
] as const satisfies readonly AuxiliaryWorkbenchCreationRecipe[]);

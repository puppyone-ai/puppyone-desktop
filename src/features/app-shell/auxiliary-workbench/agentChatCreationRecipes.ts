import type { AuxiliaryWorkbenchCreationRecipe } from "./types";

/** Composition-owned product order. PuppyOne stays last until Hornet ships. */
export const AGENT_CHAT_CREATION_RECIPES = Object.freeze([
  Object.freeze({ id: "codex", label: "Codex", iconKey: "codex", status: "available" }),
  Object.freeze({ id: "claude", label: "Claude Code", iconKey: "claude", status: "available" }),
  Object.freeze({ id: "cursor", label: "Cursor", iconKey: "cursor", status: "available" }),
  Object.freeze({ id: "opencode-native", label: "OpenCode", iconKey: "opencode", status: "available" }),
  Object.freeze({ id: "puppyone-agent", label: "PuppyOne", iconKey: "puppyone-agent", status: "coming-soon" }),
] as const satisfies readonly AuxiliaryWorkbenchCreationRecipe[]);

export { isDesktopAgentChatEnabled } from "./featureGate";

/** Public lazy entrypoint for the experimental Agent Chat renderer. */
export function loadRightAgentPanel() {
  return import("./ui/RightAgentPanel").then(({ RightAgentPanel }) => ({ default: RightAgentPanel }));
}

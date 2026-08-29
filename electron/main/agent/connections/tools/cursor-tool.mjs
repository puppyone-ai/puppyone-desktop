import { probeCursorLocal } from "../probes/cursor-local-probe.mjs";

export const CURSOR_LOCAL_TOOL = Object.freeze({
  id: "cursor-agent",
  displayName: "Cursor Agent",
  executableNames: Object.freeze(["cursor-agent", "agent", "cursor agent"]),
  probe: probeCursorLocal,
  unavailableMessage: "Install Cursor Agent and sign in to use its native ACP harness.",
});

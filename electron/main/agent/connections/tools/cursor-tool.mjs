import { probeCursorLocal } from "../probes/cursor-local-probe.mjs";

export const CURSOR_LOCAL_TOOL = Object.freeze({
  id: "cursor-agent",
  displayName: "Cursor Agent",
  executableNames: Object.freeze(["cursor-agent", "agent", "cursor agent"]),
  probe: probeCursorLocal,
  bridgeRequiredMessage: "A Cursor-to-OpenCode provider bridge is not enabled.",
});

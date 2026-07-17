import { probeCursorLocal } from "../probes/cursor-local-probe.mjs";

export const CURSOR_LOCAL_TOOL = Object.freeze({
  id: "cursor-agent",
  displayName: "Cursor Agent",
  executableNames: Object.freeze(["cursor-agent", "agent", "cursor agent"]),
  probe: probeCursorLocal,
  unavailableMessage: "PuppyOne will enable Cursor only after a stable supported Agent protocol is available.",
});

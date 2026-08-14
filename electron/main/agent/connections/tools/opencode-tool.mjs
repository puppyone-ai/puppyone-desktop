import path from "node:path";
import { probeVersionedLocalAgent } from "../probes/versioned-local-agent-probe.mjs";

export const OPENCODE_LOCAL_TOOL = Object.freeze({
  id: "opencode",
  displayName: "OpenCode",
  executableNames: Object.freeze(["opencode"]),
  candidatePaths: ({ homedir }) => [path.join(homedir, ".opencode", "bin", "opencode")],
  probe: (options) => probeVersionedLocalAgent({
    ...options,
    id: "opencode",
    displayName: "OpenCode",
  }),
  unavailableMessage: "OpenCode terminal sessions are launched only from a verified local installation.",
});

import { probeCodexLocal } from "../probes/codex-local-probe.mjs";

export const CODEX_LOCAL_TOOL = Object.freeze({
  id: "codex",
  displayName: "Codex",
  executableNames: Object.freeze(["codex"]),
  probe: probeCodexLocal,
  unavailableMessage: "Native Codex readiness is evaluated through its app-server protocol.",
});

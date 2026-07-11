import { probeCodexLocal } from "../probes/codex-local-probe.mjs";

export const CODEX_LOCAL_TOOL = Object.freeze({
  id: "codex",
  displayName: "Codex CLI",
  executableNames: Object.freeze(["codex"]),
  probe: probeCodexLocal,
  bridgeRequiredMessage: "Direct Codex sessions are not enabled; use an OpenAI route connected through OpenCode.",
});

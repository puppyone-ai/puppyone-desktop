import { probeVersionedLocalAgent } from "../probes/versioned-local-agent-probe.mjs";
import { claudeCliCandidates } from "../../runtimes/claude/claude-cli-candidates.mjs";

export const CLAUDE_LOCAL_TOOL = Object.freeze({
  id: "claude",
  displayName: "Claude Code",
  executableNames: Object.freeze(["claude"]),
  candidatePaths: ({ env, homedir, platform }) => claudeCliCandidates({
    env,
    homedir,
    platform,
  }),
  probe: (options) => probeVersionedLocalAgent({
    ...options,
    id: "claude",
    displayName: "Claude Code",
  }),
  unavailableMessage: "Claude Code terminal sessions are launched only from a verified local installation.",
});

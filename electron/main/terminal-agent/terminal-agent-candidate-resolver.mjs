import fs from "node:fs";
import {
  createExecutableSearchContext,
  resolveFirstExecutable,
} from "../local-executable-resolver.mjs";
import { verifyTerminalAgentCandidateIdentity } from "./terminal-agent-identity.mjs";

export function createTerminalAgentCandidateResolver({
  env,
  fsModule = fs,
  homedir,
  platform,
  createSearchContext = () => createExecutableSearchContext({
    env,
    fsModule,
    homedir,
    platform,
  }),
  resolveExecutable = resolveFirstExecutable,
  verifyIdentity = verifyTerminalAgentCandidateIdentity,
} = {}) {
  async function createContext() {
    return Object.freeze({ executableSearch: await createSearchContext() });
  }

  async function resolve(definition, context = null) {
    const resolutionContext = context ?? await createContext();
    const configuredPaths = typeof definition.candidatePaths === "function"
      ? await definition.candidatePaths({ env, homedir, platform })
      : [];
    return resolveExecutable({
      names: definition.executableNames,
      configuredPaths,
      searchContext: resolutionContext.executableSearch,
      acceptCandidate: (candidate) => verifyIdentity(definition, candidate, { fsModule }),
      env,
      fsModule,
      homedir,
      platform,
    });
  }

  return Object.freeze({ createContext, resolve });
}

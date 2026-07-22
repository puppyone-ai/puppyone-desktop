import { COMMIT_ID_PATTERN, createPublishError } from "../contract.mjs";

export async function resolveSourceBranchCommit(rootPath, sourceBranch, execGitCommand) {
  const sourceRef = `refs/heads/${sourceBranch}`;
  const commitOid = await execGitCommand(
    rootPath,
    ["rev-parse", "--verify", `${sourceRef}^{commit}`],
    { optionalLocks: false },
  ).then(({ stdout }) => stdout.trim().toLowerCase()).catch((error) => {
    throw createPublishError("SOURCE_MISSING", `Source branch '${sourceBranch}' is unavailable.`, false, error);
  });
  if (!COMMIT_ID_PATTERN.test(commitOid)) {
    throw createPublishError("SOURCE_MISSING", `Source branch '${sourceBranch}' has no valid commit.`, false);
  }
  return { sourceRef, commitOid };
}

export function createPushAttempt({ sequence, commitOid, now, randomUUID }) {
  const attemptId = String(randomUUID?.() ?? "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attemptId)) {
    throw createPublishError("JOURNAL_IO_FAILED", "Unable to allocate a push attempt id.", false);
  }
  const timestamp = new Date(now()).toISOString();
  return {
    attempt_id: attemptId,
    sequence,
    commit_oid: commitOid,
    expected_remote_oid: null,
    state: "preparing",
    started_at: timestamp,
    updated_at: timestamp,
    completed_at: null,
  };
}

export function archiveAttempt(attempt, outcome, now) {
  if (!attempt) return null;
  const timestamp = new Date(now()).toISOString();
  return {
    ...attempt,
    state: outcome,
    updated_at: timestamp,
    completed_at: timestamp,
  };
}

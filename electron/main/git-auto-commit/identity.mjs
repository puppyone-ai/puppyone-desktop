import crypto from "node:crypto";
import path from "node:path";

export function gitAutoCommitWorkspaceKey(identity) {
  if (!identity?.repository || !identity.gitDir || !identity.commonDir || !identity.topLevel) {
    throw new Error("A canonical Git worktree identity is required.");
  }
  const payload = [identity.topLevel, identity.gitDir, identity.commonDir]
    .map((value) => path.resolve(value))
    .join("\0");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

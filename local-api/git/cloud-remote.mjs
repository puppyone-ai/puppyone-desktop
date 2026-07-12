export function createWorkspaceCloudRemoteActions({
  execGit,
  getGitErrorOutput,
  getWorkspaceGitStatus,
  mutationTimeoutMs,
  normalizeGitRemoteName,
  normalizeGitRemoteUrl,
  resolveWorkspacePath,
}) {
  async function configureWorkspaceCloudRemote(rootPath, remoteUrl, remoteName = "puppyone") {
    const root = resolveWorkspacePath(rootPath, null);
    const normalizedRemoteName = normalizeGitRemoteName(remoteName);
    const normalizedRemoteUrl = normalizeGitRemoteUrl(remoteUrl);
    const isRepo = await execGit(root, ["rev-parse", "--is-inside-work-tree"])
      .then((result) => result.stdout.trim() === "true")
      .catch(() => false);

    if (!isRepo) {
      await execGit(root, ["init"], { timeout: mutationTimeoutMs }).catch((error) => {
        throw new Error(`Unable to initialize repository: ${getGitErrorOutput(error)}`);
      });
    }

    const remoteExists = await execGit(root, ["remote", "get-url", normalizedRemoteName])
      .then(() => true)
      .catch(() => false);
    const args = remoteExists
      ? ["remote", "set-url", normalizedRemoteName, normalizedRemoteUrl]
      : ["remote", "add", normalizedRemoteName, normalizedRemoteUrl];

    await execGit(root, args, { timeout: mutationTimeoutMs }).catch((error) => {
      throw new Error(`Unable to configure Cloud remote: ${getGitErrorOutput(error)}`);
    });

    return getWorkspaceGitStatus(root);
  }

  async function removeWorkspaceGitRemote(rootPath, remoteName = "puppyone") {
    const root = resolveWorkspacePath(rootPath, null);
    const normalizedRemoteName = normalizeGitRemoteName(remoteName);
    const remoteExists = await execGit(root, ["remote", "get-url", normalizedRemoteName])
      .then(() => true)
      .catch(() => false);

    if (remoteExists) {
      await execGit(root, ["remote", "remove", normalizedRemoteName], {
        timeout: mutationTimeoutMs,
      }).catch((error) => {
        throw new Error(`Unable to remove Cloud remote: ${getGitErrorOutput(error)}`);
      });
    }
    return getWorkspaceGitStatus(root);
  }

  return { configureWorkspaceCloudRemote, removeWorkspaceGitRemote };
}

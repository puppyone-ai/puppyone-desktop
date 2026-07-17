export function createGitSyncTargetPolicy({
  isPuppyoneRemote,
  defaultBranch = "main",
}) {
  if (typeof isPuppyoneRemote !== "function") {
    throw new TypeError("isPuppyoneRemote must be a function.");
  }

  function isPuppyoneHostingConfig(config) {
    return config?.sync?.sourceOfTruth?.service === "puppyone";
  }

  function choosePuppyoneRemoteName(remotes, config) {
    const configuredRemoteName = config?.sync?.sourceOfTruth?.remote
      ?? config?.git?.primaryRemote
      ?? config?.backup?.remote;
    const configuredRemote = configuredRemoteName
      ? remotes.find((remote) => remote.name === configuredRemoteName) ?? null
      : null;
    if (configuredRemote && isPuppyoneRemote(configuredRemote)) {
      return configuredRemote.name;
    }
    const puppyoneUrlRemote = remotes.find(isPuppyoneRemote);
    if (puppyoneUrlRemote) return puppyoneUrlRemote.name;
    return remotes.find((remote) => remote.name.toLowerCase() === "puppyone")?.name
      ?? null;
  }

  function hasEffectivePuppyoneHostingTarget(remotes, config) {
    // The canonical Project Git remote is the hosting identity. No local
    // device/folder binding record is required.
    return Boolean(choosePuppyoneRemoteName(remotes, config));
  }

  function getConfiguredSyncBranch(
    config,
    fallbackBranch = defaultBranch,
    puppyoneHostingActive = isPuppyoneHostingConfig(config),
  ) {
    if (puppyoneHostingActive) return defaultBranch;

    return config?.sync?.sourceOfTruth?.branch
      ?? config?.backup?.branch
      ?? config?.git?.watchedBranch
      ?? fallbackBranch
      ?? null;
  }

  function chooseGitSyncTarget(remotes, branches, currentBranchName, config) {
    const configuredRemoteName = config?.sync?.sourceOfTruth?.remote
      ?? config?.git?.primaryRemote
      ?? config?.backup?.remote;
    const configuredBranchName = config?.sync?.sourceOfTruth?.branch
      ?? config?.git?.watchedBranch
      ?? config?.backup?.branch;
    const remoteNames = new Set(remotes.map((remote) => remote.name));
    const currentBranchNameSafe = normalizeCurrentBranchName(currentBranchName);
    const currentBranch = branches.find((branch) => branch.current && !branch.remote);

    if (isPuppyoneHostingConfig(config)) {
      const puppyoneRemote = choosePuppyoneRemoteName(remotes, config);
      if (puppyoneRemote) {
        return {
          remote: puppyoneRemote,
          branch: getConfiguredSyncBranch(config, defaultBranch, true),
        };
      }
    }

    if (configuredBranchName) {
      const remote = configuredRemoteName && remoteNames.has(configuredRemoteName)
        ? configuredRemoteName
        : findRemoteForBranch(branches, configuredBranchName)
          ?? preferExistingRemote(remotes, "origin")
          ?? preferExistingRemote(remotes, "puppyone")
          ?? remotes[0]?.name
          ?? null;
      return { remote, branch: configuredBranchName };
    }

    if (configuredRemoteName) {
      const remote = remoteNames.has(configuredRemoteName)
        ? configuredRemoteName
        : preferExistingRemote(remotes, "origin")
          ?? preferExistingRemote(remotes, "puppyone")
          ?? remotes[0]?.name
          ?? null;

      if (!remote) return { remote: null, branch: currentBranchNameSafe };

      if (currentBranch?.upstream) {
        const upstreamTarget = splitRemoteBranchName(currentBranch.upstream);
        if (upstreamTarget?.remote === remote) return upstreamTarget;
      }

      if (currentBranchNameSafe) {
        const matchingCurrentBranch = findRemoteBranch(
          branches,
          remote,
          currentBranchNameSafe,
        );
        if (matchingCurrentBranch) return matchingCurrentBranch;
        return { remote, branch: currentBranchNameSafe };
      }

      return { remote, branch: findDefaultBranchForRemote(branches, remote) };
    }

    if (currentBranch?.upstream) {
      const upstreamTarget = splitRemoteBranchName(currentBranch.upstream);
      if (upstreamTarget) return upstreamTarget;
    }

    const originMain = findRemoteBranch(branches, "origin", "main");
    if (originMain) return originMain;

    const puppyoneMain = findRemoteBranch(branches, "puppyone", "main");
    if (puppyoneMain) return puppyoneMain;

    if (currentBranchNameSafe) {
      const originCurrent = findRemoteBranch(branches, "origin", currentBranchNameSafe);
      if (originCurrent) return originCurrent;
      const puppyoneCurrent = findRemoteBranch(
        branches,
        "puppyone",
        currentBranchNameSafe,
      );
      if (puppyoneCurrent) return puppyoneCurrent;
    }

    const fallbackRemote = preferExistingRemote(remotes, "origin")
      ?? preferExistingRemote(remotes, "puppyone")
      ?? remotes[0]?.name
      ?? null;

    return {
      remote: fallbackRemote,
      branch: findDefaultBranchForRemote(branches, fallbackRemote)
        ?? currentBranchNameSafe
        ?? null,
    };
  }

  return {
    chooseGitSyncTarget,
    choosePuppyoneRemoteName,
    getConfiguredSyncBranch,
    hasEffectivePuppyoneHostingTarget,
    isPuppyoneHostingConfig,
  };
}

export function normalizeCurrentBranchName(branchName) {
  return branchName && branchName !== "detached" ? branchName : null;
}

export function splitRemoteBranchName(value) {
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) return null;
  return {
    remote: value.slice(0, slashIndex),
    branch: value.slice(slashIndex + 1),
  };
}

function findRemoteBranch(branches, remoteName, branchName) {
  if (!remoteName || !branchName) return null;
  return branches.some(
    (branch) => branch.remote && branch.name === `${remoteName}/${branchName}`,
  )
    ? { remote: remoteName, branch: branchName }
    : null;
}

function findRemoteForBranch(branches, branchName) {
  if (!branchName) return null;
  const remoteBranch = branches.find(
    (branch) => branch.remote && branch.name.endsWith(`/${branchName}`),
  );
  return remoteBranch
    ? splitRemoteBranchName(remoteBranch.name)?.remote ?? null
    : null;
}

function findDefaultBranchForRemote(branches, remoteName) {
  if (!remoteName) return null;
  if (findRemoteBranch(branches, remoteName, "main")) return "main";
  if (findRemoteBranch(branches, remoteName, "master")) return "master";
  const firstRemoteBranch = branches.find(
    (branch) => branch.remote && branch.name.startsWith(`${remoteName}/`),
  );
  return firstRemoteBranch
    ? firstRemoteBranch.name.slice(remoteName.length + 1)
    : null;
}

function preferExistingRemote(remotes, remoteName) {
  return remotes.some((remote) => remote.name === remoteName)
    ? remoteName
    : null;
}

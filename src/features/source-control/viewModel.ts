import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../types/electron";
import { getPuppyoneRemote, parsePuppyoneRemote } from "./remotes";
import { bidiIsolate, type MessageFormatter } from "@puppyone/localization";
import type {
  GitScmSyncAction,
  GitScmSyncCopy,
  GitScmSyncSection,
  GitHostingIdentity,
  GitHostingMode,
  GitSidebarPrimaryAction,
  GitSyncState,
  SourceControlDisplayMode,
  SourceControlSidebarModel,
} from "./types";

export function getGitSyncState(
  status: GitStatusSnapshot | null,
  currentBranch: GitStatusSnapshot["branches"][number] | null,
  puppyoneConfig: PuppyoneWorkspaceConfig | null,
  t: MessageFormatter,
): GitSyncState {
  if (!status?.isRepo) {
    return {
      branchLabel: t("source-control.sync.noBranch"),
      upstreamLabel: t("source-control.status.noRepository"),
      remoteExists: false,
      setupRequired: true,
      setupTitle: t("source-control.sync.chooseTarget"),
      setupDetail: t("source-control.sync.initializeThenCloud"),
      behind: 0,
      ahead: 0,
      pullDetail: t("source-control.sync.noLocalRepository"),
      pullDisabled: true,
      pushDisabled: true,
      pullLabel: t("source-control.sync.pullRemote"),
      pullTitle: t("source-control.sync.initializeBeforePull"),
      pushTitle: t("source-control.sync.initializeBeforePush"),
      pushLabel: t("source-control.sync.push"),
      pushDetail: t("source-control.sync.noLocalRepository"),
    };
  }

  if (status.effectiveHosting.kind === "puppyone-cloud") {
    const branchLabel = displayGitBranch(status, t("source-control.branch.initial"));
    const target = status.syncTarget;
    const targetLabel = target?.ref ?? "Puppyone Cloud";
    const targetExists = target?.exists === true;
    const targetAhead = target?.ahead ?? 0;
    const targetBehind = target?.behind ?? 0;
    return {
      branchLabel,
      upstreamLabel: targetLabel,
      remoteExists: targetExists,
      setupRequired: !target?.remote,
      setupTitle: "Puppyone Cloud",
      setupDetail: target?.remote
        ? t("source-control.sync.syncingWith", { target: bidiIsolate(targetLabel) })
        : t("source-control.sync.configureCloudRemote"),
      behind: targetBehind,
      ahead: targetAhead,
      pullDetail: targetExists
        ? t("source-control.sync.cloudCommitsOn", { count: targetBehind, target: bidiIsolate(targetLabel) })
        : t("source-control.sync.noCloudBranch", { target: bidiIsolate(targetLabel) }),
      pullDisabled: !targetExists || targetBehind === 0,
      pushDisabled: targetExists
        ? targetAhead === 0 || targetBehind > 0
        : !status.headCommitId,
      pullLabel: targetBehind > 0
        ? t("source-control.sync.downloadCount", { count: targetBehind })
        : t("source-control.action.download"),
      pullTitle: targetExists
        ? targetBehind === 0
          ? t("source-control.cloud.upToDate")
          : t("source-control.sync.downloadFrom", { count: targetBehind, target: bidiIsolate(targetLabel) })
        : t("source-control.sync.cloudBranchMissing"),
      pushTitle: targetBehind > 0
        ? t("source-control.sync.downloadBeforeUpload")
        : targetAhead === 0
          ? t("source-control.sync.noCommittedToUpload")
          : t("source-control.sync.uploadTo", { count: targetAhead, target: bidiIsolate(targetLabel) }),
      pushLabel: t("source-control.sync.upload"),
      pushDetail: targetAhead > 0
        ? t("source-control.sync.committedWaiting", { count: targetAhead })
        : t("source-control.sync.noCommittedWaiting"),
    };
  }

  if (!currentBranch?.upstream) {
    const branchLabel = displayGitBranch(status, t("source-control.branch.initial"));
    const preferredRemote = getPreferredGitRemote(status, puppyoneConfig);
    const puppyoneRemote = getPuppyoneRemote(status)?.remote
      ?? status.remotes.find((remote) => remote.name.toLowerCase() === "puppyone");
    const configuredCloudBackup = puppyoneConfig?.backup?.enabled === true;
    const publishRemote = preferredRemote ?? puppyoneRemote;
    const backupBranch = puppyoneConfig?.sync?.sourceOfTruth?.branch
      ?? puppyoneConfig?.backup?.branch
      ?? puppyoneConfig?.git?.watchedBranch
      ?? branchLabel;
    const syncTarget = status.syncTarget;

    if (publishRemote) {
      const isPuppyonePublishRemote = publishRemote.name.toLowerCase() === "puppyone" || publishRemote === puppyoneRemote;
      const publishLabel = t(isPuppyonePublishRemote ? "source-control.sync.publish" : "source-control.sync.push");
      const publishTargetLabel = syncTarget?.ref ?? `${publishRemote.name}/${backupBranch}`;
      const targetExists = syncTarget?.exists === true;
      const targetAhead = targetExists ? syncTarget.ahead : 0;
      const targetBehind = targetExists ? syncTarget.behind : 0;
      return {
        branchLabel,
        upstreamLabel: publishTargetLabel,
        remoteExists: targetExists,
        setupRequired: false,
        setupTitle: t("source-control.sync.target"),
        setupDetail: t("source-control.sync.primaryRemote", { remote: bidiIsolate(publishRemote.name) }),
        behind: targetBehind,
        ahead: targetAhead,
        pullDetail: targetExists
          ? t("source-control.sync.remoteCommitsOn", { count: targetBehind, target: bidiIsolate(publishTargetLabel) })
          : t("source-control.sync.noRemoteBranch", { target: bidiIsolate(publishTargetLabel) }),
        pullDisabled: !targetExists || targetBehind === 0,
        pushDisabled: targetExists
          ? targetAhead === 0
          : !status.headCommitId,
        pullLabel: t("source-control.sync.pullRemote"),
        pullTitle: targetExists
          ? targetBehind === 0
            ? t("source-control.sync.upToDate")
            : t("source-control.sync.pullFrom", { count: targetBehind, target: bidiIsolate(publishTargetLabel) })
          : t("source-control.sync.remoteBranchMissing"),
        pushTitle: status.headCommitId
          ? targetExists && targetBehind > 0
            ? t("source-control.sync.sendDiverged", { action: publishLabel, count: targetAhead, target: bidiIsolate(publishTargetLabel) })
            : t("source-control.sync.sendBranch", { action: publishLabel, branch: bidiIsolate(branchLabel), target: bidiIsolate(publishTargetLabel) })
          : t(isPuppyonePublishRemote ? "source-control.sync.commitBeforePublish" : "source-control.sync.commitBeforePush"),
        pushLabel: publishLabel,
        pushDetail: targetExists
          ? targetAhead > 0
            ? t("source-control.sync.localWaiting", { count: targetAhead })
            : t("source-control.sync.noLocalWaiting", { target: bidiIsolate(publishTargetLabel) })
          : t("source-control.sync.createRemote", { action: publishLabel, branch: bidiIsolate(branchLabel), target: bidiIsolate(publishTargetLabel) }),
      };
    }

    if (configuredCloudBackup) {
      return {
        branchLabel,
        upstreamLabel: "Puppyone Cloud",
        remoteExists: false,
        setupRequired: false,
        setupTitle: t("source-control.sync.target"),
        setupDetail: t("source-control.sync.cloudBackupEnabled"),
        behind: 0,
        ahead: 0,
        pullDetail: t("source-control.sync.configureBeforePull"),
        pullDisabled: true,
        pushDisabled: true,
        pullLabel: t("source-control.sync.pullRemote"),
        pullTitle: t("source-control.sync.configureBeforePull"),
        pushTitle: t("source-control.sync.configureBeforePush"),
        pushLabel: t("source-control.sync.publish"),
        pushDetail: t("source-control.sync.noConfiguredRemote"),
      };
    }

    return {
      branchLabel,
      upstreamLabel: t("source-control.sync.localOnly"),
      remoteExists: false,
      setupRequired: true,
      setupTitle: t("source-control.sync.chooseTarget"),
      setupDetail: t("source-control.sync.backupLocalBranch", { branch: bidiIsolate(branchLabel) }),
      behind: 0,
      ahead: 0,
      pullDetail: t("source-control.sync.noTrackingBranch"),
      pullDisabled: true,
      pushDisabled: true,
      pullLabel: t("source-control.sync.pullRemote"),
      pullTitle: t("source-control.sync.chooseBeforePull"),
      pushTitle: t("source-control.sync.chooseBeforePush"),
      pushLabel: t("source-control.sync.push"),
      pushDetail: t("source-control.sync.chooseFirst"),
    };
  }

  const upstreamRemoteName = getUpstreamRemoteName(currentBranch.upstream);
  const upstreamRemote = status.remotes.find((remote) => remote.name === upstreamRemoteName) ?? null;
  const isPuppyoneRemote = Boolean(parsePuppyoneRemote(upstreamRemote?.pushUrl ?? upstreamRemote?.fetchUrl ?? null));
  const ahead = currentBranch.ahead || 0;
  const behind = currentBranch.behind || 0;
  const pushLabel = t(isPuppyoneRemote ? "source-control.sync.publish" : "source-control.sync.push");
  const branchLabel = displayGitBranch(status, t("source-control.branch.initial"));
  const pullDetail = behind > 0 && ahead > 0
    ? t("source-control.sync.pullBeforeSend", { count: behind, action: pushLabel })
    : t("source-control.sync.commitsOn", { count: behind, target: bidiIsolate(currentBranch.upstream) });

  return {
    branchLabel,
    upstreamLabel: currentBranch.upstream,
    remoteExists: true,
    setupRequired: false,
    setupTitle: t("source-control.sync.target"),
    setupDetail: t("source-control.sync.tracking", { target: bidiIsolate(currentBranch.upstream) }),
    behind,
    ahead,
    pullDetail,
    pullDisabled: behind === 0,
    pushDisabled: ahead === 0,
    pullLabel: behind > 0 ? t("source-control.sync.pullCount", { count: behind }) : t("source-control.sync.pullRemote"),
    pullTitle: behind === 0
      ? t("source-control.sync.upToDate")
      : t("source-control.sync.pullFrom", { count: behind, target: bidiIsolate(currentBranch.upstream) }),
    pushTitle: ahead === 0
      ? t("source-control.sync.noLocalToPush")
      : behind > 0
        ? t("source-control.sync.sendDiverged", { action: pushLabel, count: ahead, target: bidiIsolate(currentBranch.upstream) })
        : t("source-control.sync.sendTo", { action: pushLabel, count: ahead, target: bidiIsolate(currentBranch.upstream) }),
    pushLabel,
    pushDetail: ahead > 0
      ? t("source-control.sync.committedWaiting", { count: ahead })
      : t("source-control.sync.noCommittedWaiting"),
  };
}

export function buildSourceControlSidebarModel({
  status,
  syncState,
  displayMode,
  canCommit,
  t,
}: {
  status: GitStatusSnapshot | null;
  syncState: GitSyncState;
  displayMode: SourceControlDisplayMode;
  canCommit: boolean;
  t: MessageFormatter;
}): SourceControlSidebarModel {
  const sourceControl = status?.sourceControl ?? null;
  const groupById = new Map((sourceControl?.groups ?? []).map((group) => [group.id, group.resources]));
  const mergeResources = groupById.get("merge") ?? [];
  const stagedResources = groupById.get("index") ?? [];
  const workingResources = [
    ...(groupById.get("workingTree") ?? []),
    ...(groupById.get("untracked") ?? []),
  ];
  const professionalMode = displayMode === "professional";
  const committedCount = sourceControl?.remote.ahead ?? 0;
  const committedResources = sourceControl?.remote.outgoingPreview ?? [];
  const committedPrimaryAction = getCommittedPrimaryAction(status, syncState, t);
  const stagedPrimaryAction = getStagedPrimaryAction(status, syncState, stagedResources.length, canCommit, professionalMode, t);
  const localChangeResources = professionalMode ? workingResources : [...stagedResources, ...workingResources];

  return {
    professionalMode,
    mergeResources,
    stagedResources,
    workingResources,
    localChangeResources,
    committedCount,
    committedResources,
    committedPrimaryAction,
    showCommittedSection: professionalMode || committedCount > 0 || Boolean(committedPrimaryAction),
    stagedPrimaryAction,
    showSimpleChangeAction: !professionalMode && localChangeResources.length > 0,
  };
}

export type SourceControlPrimaryActionSlot = "staged" | "sync" | "committed" | "simple" | null;

export function getSourceControlPrimaryActionSlot({
  hasStagedAction,
  hasSyncAction,
  hasCommittedAction,
  hasSimpleAction,
}: {
  hasStagedAction: boolean;
  hasSyncAction: boolean;
  hasCommittedAction: boolean;
  hasSimpleAction: boolean;
}): SourceControlPrimaryActionSlot {
  if (hasStagedAction) return "staged";
  if (hasSyncAction) return "sync";
  if (hasCommittedAction) return "committed";
  if (hasSimpleAction) return "simple";
  return null;
}

export function displayGitBranch(status: GitStatusSnapshot, initialBranchLabel = "initial branch") {
  return status.branch && status.branch !== "detached" ? status.branch : initialBranchLabel;
}

export function getGitHostingMode(
  status: GitStatusSnapshot | null,
  puppyoneConfig: PuppyoneWorkspaceConfig | null = null,
): GitHostingMode {
  if (status?.effectiveHosting) {
    return status.effectiveHosting.kind === "github" || status.effectiveHosting.kind === "puppyone-cloud"
      ? status.effectiveHosting.kind
      : "generic-git";
  }

  const sourceService = puppyoneConfig?.sync?.sourceOfTruth?.service?.toLowerCase();
  if (sourceService === "github") return "github";
  if (sourceService === "puppyone" && hasConfiguredPuppyoneCloudIntent(puppyoneConfig)) return "puppyone-cloud";

  return "generic-git";
}

function hasConfiguredPuppyoneCloudIntent(config: PuppyoneWorkspaceConfig | null) {
  const configuredRemoteName = config?.sync?.sourceOfTruth?.remote
    ?? config?.git?.primaryRemote
    ?? config?.backup?.remote
    ?? null;
  return configuredRemoteName?.toLowerCase() === "puppyone";
}

export function getGitHostingIdentity(
  status: GitStatusSnapshot | null,
  _puppyoneConfig: PuppyoneWorkspaceConfig | null = null,
): GitHostingIdentity | null {
  if (status?.effectiveHosting?.identity) {
    return status.effectiveHosting.identity;
  }

  return null;
}

function getUpstreamRemoteName(upstream: string) {
  const slashIndex = upstream.indexOf("/");
  return slashIndex > 0 ? upstream.slice(0, slashIndex) : upstream;
}

function getPreferredGitRemote(status: GitStatusSnapshot | null, config: PuppyoneWorkspaceConfig | null) {
  const remotes = status?.remotes ?? [];
  const configuredRemoteName = config?.sync?.sourceOfTruth?.remote ?? config?.git?.primaryRemote ?? config?.backup?.remote;
  if (configuredRemoteName) {
    const configuredRemote = remotes.find((remote) => remote.name === configuredRemoteName);
    if (configuredRemote) return configuredRemote;
  }

  return remotes.find((remote) => remote.name === "origin")
    ?? remotes.find((remote) => remote.name.toLowerCase() === "puppyone")
    ?? remotes[0]
    ?? null;
}

export function getGitScmSyncCopy(
  status: GitStatusSnapshot | null,
  state: GitSyncState,
  t: MessageFormatter,
): GitScmSyncCopy {
  const remote = status?.sourceControl.remote;
  const target = remote?.target?.ref ?? state.upstreamLabel;
  if (!remote) {
    return {
      title: t("source-control.sync.remoteChanges"),
      count: 0,
      detail: t("source-control.sync.readingState"),
      tone: "muted",
    };
  }

  if (remote.state === "publish") {
    return {
      title: t("source-control.sync.remoteBranch"),
      count: 0,
      detail: t("source-control.sync.publishBranch", {
        branch: bidiIsolate(state.branchLabel),
        target: bidiIsolate(target),
      }),
      tone: "pending",
    };
  }

  if (remote.state === "diverged") {
    return {
      title: t("source-control.sync.conflict"),
      count: remote.behind,
      detail: t("source-control.sync.incomingOutgoing", { incoming: remote.behind, outgoing: remote.ahead }),
      tone: "warning",
    };
  }

  if (remote.state === "incoming") {
    return {
      title: t("source-control.sync.remoteChanges"),
      count: remote.behind,
      detail: target,
      tone: "warning",
    };
  }

  if (remote.state === "outgoing") {
    return {
      title: t("source-control.sync.remoteChanges"),
      count: 0,
      detail: target,
      tone: "ready",
    };
  }

  if (remote.state === "no-remote") {
    return {
      title: t("source-control.sync.remoteChanges"),
      count: 0,
      detail: t("source-control.sync.connectRemote"),
      tone: "muted",
    };
  }

  return {
    title: t("source-control.sync.remoteChanges"),
    count: 0,
    detail: target,
    tone: "ready",
  };
}

export function getGitScmSyncSection(
  status: GitStatusSnapshot | null,
  state: GitSyncState,
  t: MessageFormatter,
): GitScmSyncSection {
  const remote = status?.sourceControl.remote;
  const copy = getGitScmSyncCopy(status, state, t);
  const action = getGitScmSyncAction(remote, state, t);
  const previewResources = remote && remote.behind > 0 ? remote.incomingPreview : [];
  const fallbackSummary = getGitScmSyncFallbackSummary(remote, copy, state, previewResources.length, t);

  return {
    copy,
    action,
    previewResources,
    fallbackSummary,
  };
}

export function getGitScmSyncAction(
  remote: GitStatusSnapshot["sourceControl"]["remote"] | undefined,
  state: GitSyncState,
  t: MessageFormatter,
): GitScmSyncAction | null {
  if (!remote) return null;

  if (remote.state === "diverged") {
    return {
      kind: "pull",
      label: t("source-control.sync.resolve"),
      loadingLabel: t("source-control.sync.resolving"),
      title: t("source-control.sync.resolveTitle"),
      disabled: true,
      icon: "download",
    };
  }

  if (remote.canPull) {
    return {
      kind: "pull",
      label: t("source-control.sync.pull"),
      loadingLabel: t("source-control.sync.pulling"),
      title: state.pullTitle,
      disabled: false,
      icon: "download",
    };
  }

  return null;
}

function getGitScmSyncFallbackSummary(
  remote: GitStatusSnapshot["sourceControl"]["remote"] | undefined,
  copy: GitScmSyncCopy,
  state: GitSyncState,
  previewCount: number,
  t: MessageFormatter,
) {
  if (!remote || copy.count === 0 || previewCount > 0) return null;

  if (remote.behind > 0) {
    return t("source-control.sync.remoteReady", {
      count: remote.behind,
      target: bidiIsolate(remote.target?.ref ?? remote.upstream ?? state.upstreamLabel),
    });
  }

  if (remote.ahead > 0) {
    return t("source-control.sync.localReady", { count: remote.ahead, action: state.pushLabel });
  }

  return null;
}

export function getCommittedPrimaryAction(
  status: GitStatusSnapshot | null,
  state: GitSyncState,
  t: MessageFormatter,
): GitSidebarPrimaryAction | null {
  const remote = status?.sourceControl.remote;
  if (!remote) return null;

  if (remote.canPublish) {
    return {
      label: t("source-control.sync.publish"),
      title: state.pushTitle,
      disabled: false,
      kind: "publish",
      loadingKey: "publish",
      loadingLabel: t("source-control.sync.publishing"),
      icon: "upload",
    };
  }

  if (remote.state === "diverged") {
    return {
      label: state.pushLabel,
      title: state.pushTitle,
      disabled: false,
      kind: "push",
      loadingKey: "push",
      loadingLabel: t("source-control.sync.pushing"),
      icon: "upload",
    };
  }

  if (remote.canPush) {
    return {
      label: state.pushLabel,
      title: state.pushTitle,
      disabled: false,
      kind: "push",
      loadingKey: "push",
      loadingLabel: t("source-control.sync.pushing"),
      icon: "upload",
    };
  }

  return null;
}

export function getStagedPrimaryAction(
  status: GitStatusSnapshot | null,
  state: GitSyncState,
  stagedCount: number,
  canCommit: boolean,
  professionalMode: boolean,
  t: MessageFormatter,
): GitSidebarPrimaryAction | null {
  const remote = status?.sourceControl.remote;
  const publish = remote?.state === "publish" || remote?.canPublish === true;
  const label = t(publish ? "source-control.sync.commitPublish" : "source-control.sync.commitPush");
  const commitOnly: GitSidebarPrimaryAction = {
    label: t("source-control.sync.commit"),
    title: t("source-control.sync.commitStaged"),
    disabled: false,
    kind: "commit",
    loadingKey: "commit",
    loadingLabel: t("source-control.action.committing"),
    icon: "plus",
  };

  if (stagedCount === 0) {
    return null;
  }

  if (!canCommit) {
    return {
      label: t("source-control.sync.commit"),
      title: t("source-control.sync.stageBeforeCommit"),
      disabled: true,
      kind: "commit",
      loadingKey: "commit",
      loadingLabel: t("source-control.action.committing"),
      icon: "plus",
    };
  }

  if (professionalMode) {
    return commitOnly;
  }

  if (!remote?.target && !remote?.upstream) {
    return commitOnly;
  }

  if (remote.behind > 0) {
    return {
      ...commitOnly,
      title: t("source-control.sync.commitThenPull"),
    };
  }

  return {
    label,
    title: publish
      ? t("source-control.sync.commitThenPublish", { branch: bidiIsolate(state.branchLabel) })
      : t("source-control.sync.commitThenPush", { target: bidiIsolate(remote.target?.ref ?? remote.upstream ?? state.upstreamLabel) }),
    disabled: false,
    kind: "commit-push",
    loadingKey: "commit-push",
    loadingLabel: t(publish ? "source-control.sync.publishing" : "source-control.sync.pushing"),
    icon: "upload",
  };
}

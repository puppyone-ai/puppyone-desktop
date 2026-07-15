import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  getCloudRepositoryContext,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot } from "../../../types/electron";
import {
  describePuppyoneRemoteCandidates,
  resolveCanonicalPuppyoneRemotes,
  type PuppyoneRemoteResolution,
} from "../../source-control/remotes";
import {
  isRetryableCloudFailure,
  type RecentWorkspaceCloudContext,
} from "./cloudProjectResolution";
import { isTrustedCloudGitOrigin } from "./workspaceGitRemote";
import { createWorkspaceCloudResolutionKey } from "./workspaceCloudResolutionKey";
import { cloudMessage } from "../cloudPresentation";
import { repositoryTargetMatchesRemote } from "../repositoryTarget";

type UniqueRemote = Extract<PuppyoneRemoteResolution, { status: "unique" }>;
type ResolutionSnapshot = {
  key: string;
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  desktopCloudApiBaseUrl: string | null;
  workspace: Workspace;
};

function errorStatus(error: unknown): number | null {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status) || null
    : null;
}

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "") || null
    : null;
}

function contextMatchesRemote(
  remote: UniqueRemote,
  context: Awaited<ReturnType<typeof getCloudRepositoryContext>>,
): boolean {
  return remote.info.kind !== "access-point"
    && context.project.id === context.target.project_id
    && repositoryTargetMatchesRemote(context.target, remote.info);
}

/** Resolve the open workspace exclusively from its PuppyOne Git remote. */
export function useCloudWorkspaceContext({
  activeCloudSession,
  activeGitStatus,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  resolutionInputsLoading,
  setRecentWorkspaceCloudContexts,
  updateCloudSession,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  resolutionInputsLoading: boolean;
  setRecentWorkspaceCloudContexts: Dispatch<SetStateAction<Record<string, RecentWorkspaceCloudContext>>>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const nextKey = workspace
    ? createWorkspaceCloudResolutionKey({
        activeCloudSession,
        activeGitStatus,
        desktopCloudApiBaseUrl,
        workspace,
      })
    : null;
  const snapshotRef = useRef<ResolutionSnapshot | null>(null);
  if (!workspace || !nextKey) snapshotRef.current = null;
  else if (snapshotRef.current?.key !== nextKey) {
    snapshotRef.current = {
      key: nextKey,
      activeCloudSession,
      activeGitStatus,
      desktopCloudApiBaseUrl,
      workspace,
    };
  }
  const snapshot = snapshotRef.current;

  useEffect(() => {
    if (!snapshot || workspaceIsCloud || !cloudEnabled) return undefined;
    const {
      activeCloudSession,
      activeGitStatus,
      desktopCloudApiBaseUrl,
      workspace,
      key: resolutionKey,
    } = snapshot;
    const remoteResolution = resolveCanonicalPuppyoneRemotes(activeGitStatus);
    const apiBaseUrl = desktopCloudApiBaseUrl ?? activeCloudSession?.api_base_url ?? null;
    let cancelled = false;
    const apply = (next: RecentWorkspaceCloudContext) => {
      if (cancelled) return;
      setRecentWorkspaceCloudContexts((current) => ({
        ...current,
        [workspace.id]: { ...next, resolutionKey },
      }));
    };

    if (resolutionInputsLoading) {
      apply({
        projectId: null,
        hasCloudRemote: remoteResolution.status !== "none",
        resolutionPending: true,
        error: null,
        reason: null,
      });
      return () => { cancelled = true; };
    }
    if (remoteResolution.status === "none") {
      // The core invariant: no PuppyOne Git remote means local-only and no
      // Cloud request, regardless of stale historical config content.
      apply({ projectId: null, hasCloudRemote: false, error: null, reason: null });
      return () => { cancelled = true; };
    }
    if (remoteResolution.status === "conflict") {
      apply({
        projectId: null,
        hasCloudRemote: true,
        error: cloudMessage(
          "remote-locator-conflict",
          undefined,
          describePuppyoneRemoteCandidates(remoteResolution.candidates),
        ),
        reason: "locator-conflict",
      });
      return () => { cancelled = true; };
    }
    const cloudRemote = remoteResolution;
    if (!isTrustedCloudGitOrigin(cloudRemote.rawUrl, apiBaseUrl)) {
      apply({
        projectId: null,
        candidateProjectId: cloudRemote.info.projectId ?? null,
        hasCloudRemote: true,
        error: cloudMessage("remote-wrong-host", { origin: cloudRemote.info.origin }),
        reason: "wrong-host",
      });
      return () => { cancelled = true; };
    }
    if (!activeCloudSession) {
      apply({
        projectId: null,
        candidateProjectId: cloudRemote.info.projectId ?? null,
        hasCloudRemote: true,
        error: cloudMessage("remote-sign-in"),
        reason: "wrong-account",
      });
      return () => { cancelled = true; };
    }

    const onFailure = (error: unknown, retry?: () => Promise<void>) => {
      if (cancelled) return;
      if (errorCode(error) === "SESSION_CHANGED") {
        // Session rotation is an internal concurrency event, not a user-facing
        // repository failure. Keep the resolver pending and retry once against
        // the main process's current session generation.
        apply({
          projectId: null,
          candidateProjectId: cloudRemote.info.projectId ?? null,
          hasCloudRemote: true,
          resolutionPending: true,
          error: null,
          reason: null,
        });
        if (retry) {
          void Promise.resolve().then(retry).catch((retryError) => onFailure(retryError));
        }
        return;
      }
      const status = errorStatus(error);
      apply({
        projectId: null,
        candidateProjectId: cloudRemote.info.projectId ?? null,
        hasCloudRemote: true,
        error: status === 401
          ? cloudMessage("remote-sign-in")
          : status === 403
            ? cloudMessage("remote-not-authorized")
            : status === 404
              ? cloudMessage("remote-not-found")
              : cloudMessage(
                  isRetryableCloudFailure(status) ? "remote-network-failed" : "remote-unresolvable",
                  undefined,
                  error instanceof Error ? error.message : String(error),
                ),
        reason: status === 401
          ? "wrong-account"
          : status === 403
            ? "not-authorized"
            : status === 404
              ? "not-found"
              : isRetryableCloudFailure(status) ? "network" : "unresolvable",
      });
    };

    const resolveCanonical = async () => {
      const target = cloudRemote.info.kind === "scope"
        ? {
            kind: "scope" as const,
            project_id: cloudRemote.info.projectId as string,
            scope_id: cloudRemote.info.scopeId as string,
          }
        : {
            kind: "project_root" as const,
            project_id: cloudRemote.info.projectId as string,
          };
      const context = await getCloudRepositoryContext(
        activeCloudSession,
        cloudRemote.info.projectId as string,
        target,
        updateCloudSession,
        desktopCloudApiBaseUrl,
      );
      if (!contextMatchesRemote(cloudRemote, context)) {
        apply({
          projectId: null,
          candidateProjectId: cloudRemote.info.projectId ?? null,
          hasCloudRemote: true,
          error: cloudMessage("remote-response-mismatch"),
          reason: "locator-conflict",
        });
        return;
      }
      apply({
        projectId: context.project.id,
        target: context.target,
        scopePath: context.scope_path ?? null,
        capabilities: context.project.capabilities ?? [],
        hasCloudRemote: true,
        error: null,
        reason: null,
      });
    };
    void resolveCanonical().catch((error) => onFailure(error, resolveCanonical));
    return () => { cancelled = true; };
  }, [
    cloudEnabled,
    resolutionInputsLoading,
    setRecentWorkspaceCloudContexts,
    snapshot,
    updateCloudSession,
    workspaceIsCloud,
  ]);
}

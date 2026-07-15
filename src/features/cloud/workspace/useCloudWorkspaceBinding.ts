import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  getCloudProject,
  getCloudWorkspaceBinding,
  resolveCanonicalCloudWorkspaceRemote,
  resolveLegacyCloudWorkspaceRemote,
  type DesktopCloudSession,
  type DesktopCloudWorkspaceBinding,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import {
  describePuppyoneRemoteCandidates,
  resolvePuppyoneRemotes,
  type PuppyoneRemoteResolution,
} from "../../source-control/remotes";
import {
  isRetryableCloudFailure,
  type RecentWorkspaceCloudBinding,
} from "./cloudProjectResolution";
import {
  bindingMatchesWorkspace,
  isTrustedCloudGitOrigin,
  sameCloudOrigin,
} from "./explicitWorkspaceBinding";
import { createWorkspaceCloudResolutionKey } from "./workspaceCloudResolutionKey";
import { cloudMessage } from "../cloudPresentation";
import {
  repositoryTargetMatchesRemote,
} from "../repositoryTarget";

const LEGACY_CONFIRMATION_MESSAGE = cloudMessage("binding-confirm-legacy");
const FORBIDDEN_MESSAGE = cloudMessage("binding-forbidden");
const REMOTE_CONFLICT_MESSAGE = cloudMessage("binding-remote-conflict");

type BindingHint = RecentWorkspaceCloudBinding;
type UniqueRemote = Extract<PuppyoneRemoteResolution, { status: "unique" }>;
type WorkspaceCloudResolutionSnapshot = {
  key: string;
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  desktopCloudApiBaseUrl: string | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  workspace: Workspace;
};

function errorStatus(error: unknown): number | null {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status) || null
    : null;
}

function canonicalRemoteMatchesBinding(
  remote: UniqueRemote,
  binding: DesktopCloudWorkspaceBinding,
): boolean {
  const { info } = remote;
  if (info.kind === "access-point") return false;
  if (!sameCloudOrigin(remote.rawUrl, binding.cloud_origin)) return false;
  return repositoryTargetMatchesRemote(binding.target, info);
}

function canonicalContextMatchesRemote(
  remote: UniqueRemote,
  context: Awaited<ReturnType<typeof resolveCanonicalCloudWorkspaceRemote>>,
): boolean {
  const { info } = remote;
  if (info.kind === "access-point") return false;
  return repositoryTargetMatchesRemote(context.target, info);
}

/**
 * Resolve one open Local workspace into a durable binding, an authorized
 * canonical Project context, local-only, or a fail-closed recovery state.
 * This controller never creates bindings, rotates credentials, edits Git, or
 * uploads content.
 */
export function useCloudWorkspaceBinding({
  activeCloudSession,
  activeGitStatus,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  puppyoneConfig,
  resolutionInputsLoading,
  setRecentWorkspaceCloudBindings,
  updateCloudSession,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  resolutionInputsLoading: boolean;
  setRecentWorkspaceCloudBindings: Dispatch<SetStateAction<Record<string, RecentWorkspaceCloudBinding>>>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  const nextResolutionKey = workspace
    ? createWorkspaceCloudResolutionKey({
        activeCloudSession,
        activeGitStatus,
        desktopCloudApiBaseUrl,
        puppyoneConfig,
        workspace,
      })
    : null;
  const resolutionSnapshotRef = useRef<WorkspaceCloudResolutionSnapshot | null>(null);
  if (!workspace || !nextResolutionKey) {
    resolutionSnapshotRef.current = null;
  } else if (resolutionSnapshotRef.current?.key !== nextResolutionKey) {
    // Git status and public session objects refresh much more often than the
    // Project locator/account identity they contain. Retain one immutable
    // snapshot per identity key so those background refreshes do not restart
    // authorization or issue duplicate binding/readiness requests.
    resolutionSnapshotRef.current = {
      key: nextResolutionKey,
      activeCloudSession,
      activeGitStatus,
      desktopCloudApiBaseUrl,
      puppyoneConfig,
      workspace,
    };
  }
  const resolutionSnapshot = resolutionSnapshotRef.current;

  useEffect(() => {
    if (!resolutionSnapshot || workspaceIsCloud || !cloudEnabled) return undefined;

    const {
      activeCloudSession,
      activeGitStatus,
      desktopCloudApiBaseUrl,
      puppyoneConfig,
      workspace,
      key: resolutionKey,
    } = resolutionSnapshot;

    const configProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;
    const configBindingId = puppyoneConfig?.cloud.bindingId?.trim() || null;
    const configOrigin = puppyoneConfig?.cloud.origin?.trim() || null;
    const configWorkspaceInstanceId = puppyoneConfig?.project.workspaceInstanceId?.trim() || null;
    const workspaceInstanceId = workspace.workspaceInstanceId?.trim() || null;
    const remoteResolution = resolvePuppyoneRemotes(activeGitStatus);
    const apiBaseUrl = desktopCloudApiBaseUrl ?? activeCloudSession?.api_base_url ?? null;
    let cancelled = false;

    const apply = (next: BindingHint) => {
      if (cancelled) return;
      setRecentWorkspaceCloudBindings((current) => ({
        ...current,
        [workspace.id]: { ...next, resolutionKey },
      }));
    };

    // Do not classify a workspace until both local identity inputs are a
    // complete snapshot. Otherwise a canonical remote can briefly appear as
    // local-only while config or Git discovery is still in flight.
    if (resolutionInputsLoading) {
      apply({
        projectId: null,
        bindingId: configBindingId,
        cloudLinked: Boolean(configBindingId && configProjectId),
        resolutionPending: true,
        error: null,
        reason: null,
      });
      return () => { cancelled = true; };
    }

    if (remoteResolution.status === "conflict") {
      apply({
        projectId: null,
        candidateProjectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: cloudMessage(
          "binding-locator-conflict",
          undefined,
          describePuppyoneRemoteCandidates(remoteResolution.candidates),
        ),
        reason: "locator-conflict",
      });
      return () => { cancelled = true; };
    }

    const cloudRemote = remoteResolution.status === "unique" ? remoteResolution : null;

    if (configBindingId && !configProjectId) {
      apply({
        projectId: null,
        bindingId: configBindingId,
        cloudLinked: true,
        error: cloudMessage("binding-response-mismatch"),
        reason: "binding-revoked",
      });
      return () => { cancelled = true; };
    }

    if (!configBindingId || !configProjectId) {
      if (!cloudRemote) {
        apply({ projectId: null, cloudLinked: false, error: null, reason: null });
        return () => { cancelled = true; };
      }
      if (!activeCloudSession) {
        apply({
          projectId: null,
          cloudLinked: true,
          error: cloudMessage(
            cloudRemote.info.kind === "access-point"
              ? "binding-sign-in-identify"
              : "binding-switch-account",
          ),
          reason: "wrong-account",
        });
        return () => { cancelled = true; };
      }
      if (!isTrustedCloudGitOrigin(cloudRemote.rawUrl, apiBaseUrl)) {
        apply({
          projectId: null,
          cloudLinked: true,
          error: cloudMessage("binding-wrong-host", { origin: cloudRemote.info.origin }),
          reason: "wrong-host",
        });
        return () => { cancelled = true; };
      }

      if (cloudRemote.info.kind !== "access-point") {
        void resolveCanonicalCloudWorkspaceRemote(
          activeCloudSession,
          cloudRemote.rawUrl,
          updateCloudSession,
          desktopCloudApiBaseUrl,
        ).then(async (context) => {
          if (cancelled) return;
          if (!canonicalContextMatchesRemote(cloudRemote, context)) {
            apply({
              projectId: null,
              candidateProjectId: cloudRemote.info.projectId ?? null,
              cloudLinked: true,
              error: cloudMessage("binding-response-mismatch"),
              reason: "locator-conflict",
            });
            return;
          }
          const project = await getCloudProject(
            activeCloudSession,
            context.target.project_id,
            updateCloudSession,
            desktopCloudApiBaseUrl,
          );
          if (cancelled) return;
          if (project.id !== context.target.project_id) {
            apply({
              projectId: null,
              candidateProjectId: cloudRemote.info.projectId ?? null,
              cloudLinked: true,
              error: cloudMessage("binding-response-mismatch"),
              reason: "locator-conflict",
            });
            return;
          }
          apply({
            projectId: project.id,
            resolutionSource: "canonical-remote",
            bindingStatus: "not-bound",
            bindingId: null,
            target: context.target,
            scopePath: null,
            capabilities: project.capabilities ?? [],
            cloudLinked: true,
            error: null,
            reason: null,
          });
        }).catch((error) => {
          if (cancelled) return;
          const status = errorStatus(error);
          apply({
            projectId: null,
            candidateProjectId: cloudRemote.info.projectId ?? null,
            cloudLinked: true,
            error: status === 401
              ? cloudMessage("binding-switch-account")
              : status === 403
                ? cloudMessage("binding-not-authorized")
                : status === 404
                  ? cloudMessage("binding-not-found")
                : isRetryableCloudFailure(status)
                    ? cloudMessage(
                        "binding-network-failed",
                        undefined,
                        error instanceof Error ? error.message : String(error),
                      )
                    : cloudMessage(
                        "binding-unresolvable",
                        undefined,
                        error instanceof Error ? error.message : String(error),
                      ),
            reason: status === 401
              ? "wrong-account"
              : status === 403
                ? "not-authorized"
                : status === 404
                  ? "not-found"
                  : isRetryableCloudFailure(status)
                    ? "network"
                    : "unresolvable",
          });
        });
        return () => { cancelled = true; };
      }

      void resolveLegacyCloudWorkspaceRemote(
        activeCloudSession,
        cloudRemote.rawUrl,
        updateCloudSession,
        desktopCloudApiBaseUrl,
      ).then((candidate) => {
        apply({
          projectId: null,
          candidateProjectId: candidate.target.project_id,
          candidateTarget: candidate.target,
          bindingId: null,
          target: candidate.target,
          scopePath: null,
          cloudLinked: true,
          error: LEGACY_CONFIRMATION_MESSAGE,
          reason: "legacy-confirmation-required",
        });
      }).catch((error) => {
        const status = errorStatus(error);
        apply({
          projectId: null,
          cloudLinked: true,
          error: status === 401
            ? cloudMessage("binding-switch-account")
            : status === 403
              ? cloudMessage("binding-not-authorized")
              : isRetryableCloudFailure(status)
                ? cloudMessage(
                    "binding-network-failed",
                    undefined,
                    error instanceof Error ? error.message : String(error),
                  )
              : cloudMessage(
                  "binding-unresolvable",
                  undefined,
                  error instanceof Error ? error.message : String(error),
                ),
          reason: status === 401
            ? "wrong-account"
            : status === 403
              ? "not-authorized"
              : isRetryableCloudFailure(status)
                ? "network"
              : "unresolvable",
        });
      });
      return () => { cancelled = true; };
    }

    if (!configOrigin || !isTrustedCloudGitOrigin(configOrigin, apiBaseUrl)) {
      apply({
        projectId: null,
        candidateProjectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: cloudMessage("binding-wrong-host", { origin: configOrigin ?? "—" }),
        reason: "wrong-host",
      });
      return () => { cancelled = true; };
    }
    if (
      !configWorkspaceInstanceId
      || !workspaceInstanceId
      || configWorkspaceInstanceId !== workspaceInstanceId
    ) {
      apply({
        projectId: null,
        candidateProjectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: cloudMessage("binding-checkout-mismatch"),
        reason: "binding-revoked",
      });
      return () => { cancelled = true; };
    }
    if (
      cloudRemote
      && (
        cloudRemote.info.kind === "access-point"
        || cloudRemote.info.projectId !== configProjectId
        || !sameCloudOrigin(cloudRemote.rawUrl, configOrigin)
      )
    ) {
      apply({
        projectId: null,
        candidateProjectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: REMOTE_CONFLICT_MESSAGE,
        reason: "locator-conflict",
      });
      return () => { cancelled = true; };
    }
    if (!activeCloudSession) {
      apply({
        projectId: null,
        candidateProjectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: cloudMessage("binding-switch-account"),
        reason: "wrong-account",
      });
      return () => { cancelled = true; };
    }

    void (async () => {
      let verifiedBinding: DesktopCloudWorkspaceBinding | null = null;
      try {
        const binding = await getCloudWorkspaceBinding(
          activeCloudSession,
          configBindingId,
          updateCloudSession,
          desktopCloudApiBaseUrl,
        );
        if (cancelled) return;
        if (
          binding.id !== configBindingId
          || !bindingMatchesWorkspace({
            binding,
            workspace,
            configuredProjectId: configProjectId,
            configuredOrigin: configOrigin,
            expectedUserId: activeCloudSession.user_id,
          })
        ) {
          apply({
            projectId: null,
            candidateProjectId: configProjectId,
            bindingId: configBindingId,
            cloudLinked: true,
            error: cloudMessage("binding-response-mismatch"),
            reason: "binding-revoked",
          });
          return;
        }
        if (cloudRemote && !canonicalRemoteMatchesBinding(cloudRemote, binding)) {
          apply({
            projectId: null,
            candidateProjectId: configProjectId,
            bindingId: binding.id,
            cloudLinked: true,
            error: REMOTE_CONFLICT_MESSAGE,
            reason: "locator-conflict",
          });
          return;
        }
        if (!binding.usable) {
          const reason = binding.unusable_reason === "wrong_account"
            ? "wrong-account"
            : binding.unusable_reason === "role_downgraded"
              ? "role-downgraded"
              : "binding-revoked";
          apply({
            projectId: null,
            candidateProjectId: configProjectId,
            bindingId: binding.id,
            target: binding.target,
            scopePath: binding.scope_path ?? null,
            cloudLinked: true,
            error: reason === "wrong-account" ? cloudMessage("binding-switch-account") : FORBIDDEN_MESSAGE,
            reason,
          });
          return;
        }
        verifiedBinding = binding;

        // The binding lookup is itself the authoritative, human-authorized
        // Project-context decision. Promote that exact context immediately;
        // Project metadata/readiness are secondary hydration and must not keep
        // the whole workspace behind a blocking resolver screen.
        apply({
          projectId: configProjectId,
          resolutionSource: "workspace-binding",
          bindingStatus: "bound",
          bindingId: binding.id,
          target: binding.target,
          scopePath: binding.scope_path ?? null,
          capabilities: binding.capabilities ?? [],
          cloudLinked: true,
          error: cloudRemote ? null : cloudMessage("binding-remote-missing"),
          reason: null,
        });

        // Target authorization and Project presentation are separate. Hydrate
        // current Project capabilities only when the binding response omits
        // them; readiness remains owned by useDesktopCloudData.
        if (binding.capabilities != null) return;
        const project = await getCloudProject(
          activeCloudSession,
          configProjectId,
          updateCloudSession,
          desktopCloudApiBaseUrl,
        );
        if (cancelled) return;
        if (
          project.id !== configProjectId
          || (project.org_id && project.org_id !== binding.org_id)
        ) {
          apply({
            projectId: null,
            candidateProjectId: configProjectId,
            bindingId: binding.id,
            cloudLinked: true,
            error: cloudMessage("binding-response-mismatch"),
            reason: "binding-revoked",
          });
          return;
        }
        apply({
          projectId: configProjectId,
          resolutionSource: "workspace-binding",
          bindingStatus: "bound",
          bindingId: binding.id,
          target: binding.target,
          scopePath: binding.scope_path ?? null,
          capabilities: project.capabilities ?? [],
          cloudLinked: true,
          error: cloudRemote ? null : cloudMessage("binding-remote-missing"),
          reason: null,
        });
      } catch (error) {
        if (cancelled) return;
        const status = errorStatus(error);
        const networkError = cloudMessage(
          "binding-network-failed",
          undefined,
          error instanceof Error ? error.message : String(error),
        );
        if (isRetryableCloudFailure(status)) {
          setRecentWorkspaceCloudBindings((current) => {
            if (cancelled) return current;
            const previous = current[workspace.id];
            const reusablePrevious = previous?.resolutionKey === resolutionKey
              && previous.projectId === configProjectId
              && previous.bindingId === configBindingId
              && previous.resolutionSource === "workspace-binding"
              && previous.bindingStatus === "bound";
            const retained = reusablePrevious ? previous : null;
            const hasVerifiedContext = Boolean(verifiedBinding || retained);
            const next: BindingHint = hasVerifiedContext
              ? {
                  projectId: configProjectId,
                  resolutionSource: "workspace-binding",
                  bindingStatus: "bound",
                  candidateProjectId: configProjectId,
                  bindingId: configBindingId,
                  target: verifiedBinding?.target ?? retained?.target ?? null,
                  scopePath: verifiedBinding?.scope_path ?? retained?.scopePath ?? null,
                  readiness: retained?.readiness ?? null,
                  capabilities: retained?.capabilities ?? [],
                  cloudLinked: true,
                  error: networkError,
                  reason: "network",
                }
              : {
                  projectId: null,
                  candidateProjectId: configProjectId,
                  bindingId: configBindingId,
                  cloudLinked: true,
                  error: networkError,
                  reason: "network",
                };
            return {
              ...current,
              [workspace.id]: { ...next, resolutionKey },
            };
          });
          return;
        }
        apply({
          projectId: null,
          candidateProjectId: configProjectId,
          bindingId: configBindingId,
          cloudLinked: true,
          error: status === 401
            ? cloudMessage("binding-switch-account")
            : status === 403 || status === 404
              ? FORBIDDEN_MESSAGE
              : networkError,
          reason: status === 401
            ? "wrong-account"
            : status === 403 || status === 404
              ? "not-authorized"
              : "network",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [
    cloudEnabled,
    resolutionSnapshot,
    resolutionInputsLoading,
    setRecentWorkspaceCloudBindings,
    updateCloudSession,
    workspaceIsCloud,
  ]);
}

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Workspace } from "@puppyone/shared-ui";
import {
  getCloudProject,
  getCloudProjectReadiness,
  getCloudWorkspaceBinding,
  resolveLegacyCloudWorkspaceRemote,
  type DesktopCloudProject,
  type DesktopCloudSession,
} from "../../../lib/cloudApi";
import type { GitStatusSnapshot, PuppyoneWorkspaceConfig } from "../../../types/electron";
import { getPuppyoneRemote } from "../../source-control/remotes";
import type { RecentWorkspaceCloudBinding } from "./cloudProjectResolution";
import { bindingMatchesWorkspace, sameCloudOrigin } from "./explicitWorkspaceBinding";

const LEGACY_CONFIRMATION_MESSAGE =
  "Confirm this Cloud project before converting the legacy Git remote into a workspace binding.";
const FORBIDDEN_MESSAGE =
  "This folder is linked to a Cloud project that the current account cannot access.";

type BindingHint = RecentWorkspaceCloudBinding;

function errorStatus(error: unknown): number | null {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status) || null
    : null;
}

function upsertProject(
  projects: DesktopCloudProject[],
  project: DesktopCloudProject,
): DesktopCloudProject[] {
  const index = projects.findIndex((entry) => entry.id === project.id);
  if (index < 0) return [...projects, project];
  if (projects[index] === project) return projects;
  const next = [...projects];
  next[index] = project;
  return next;
}

/**
 * The single Local workspace -> Cloud Project binding controller.
 *
 * Normal opens resolve one binding id. Git remotes are only a one-time legacy
 * discovery input and never become authorization or identity facts.
 */
export function useCloudWorkspaceBinding({
  activeCloudSession,
  activeGitStatus,
  cloudEnabled,
  desktopCloudApiBaseUrl,
  homeCloudProjects: _homeCloudProjects,
  puppyoneConfig,
  setHomeCloudProjects,
  setRecentWorkspaceCloudBindings,
  updateCloudSession,
  workspace,
  workspaceIsCloud,
}: {
  activeCloudSession: DesktopCloudSession | null;
  activeGitStatus: GitStatusSnapshot | null;
  cloudEnabled: boolean;
  desktopCloudApiBaseUrl: string | null;
  handlePuppyoneConfigChange: (nextConfig: PuppyoneWorkspaceConfig) => Promise<PuppyoneWorkspaceConfig | null>;
  homeCloudProjects: DesktopCloudProject[];
  puppyoneConfig: PuppyoneWorkspaceConfig | null;
  setHomeCloudProjects: Dispatch<SetStateAction<DesktopCloudProject[]>>;
  setRecentWorkspaceCloudBindings: Dispatch<SetStateAction<Record<string, RecentWorkspaceCloudBinding>>>;
  updateCloudSession: (session: DesktopCloudSession | null) => void;
  workspace: Workspace | null;
  workspaceIsCloud: boolean;
}) {
  useEffect(() => {
    if (!workspace || workspaceIsCloud || !cloudEnabled) return undefined;

    const configProjectId = puppyoneConfig?.cloud.projectId?.trim() || null;
    const configBindingId = puppyoneConfig?.cloud.bindingId?.trim() || null;
    const configOrigin = puppyoneConfig?.cloud.origin?.trim() || null;
    const configWorkspaceInstanceId = puppyoneConfig?.project.workspaceInstanceId?.trim() || null;
    const workspaceInstanceId = workspace.workspaceInstanceId?.trim() || null;
    const cloudRemote = getPuppyoneRemote(activeGitStatus);

    const apply = (next: BindingHint) => {
      setRecentWorkspaceCloudBindings((current) => ({
        ...current,
        [workspace.id]: next,
      }));
    };

    if (!configBindingId || !configProjectId) {
      if (!cloudRemote) {
        apply({ projectId: null, cloudLinked: false, error: null, reason: null });
        return undefined;
      }
      if (!activeCloudSession) {
        apply({
          projectId: null,
          cloudLinked: true,
          error: "Sign in to identify this legacy Cloud remote.",
          reason: "wrong-account",
        });
        return undefined;
      }

      let cancelled = false;
      void resolveLegacyCloudWorkspaceRemote(
        activeCloudSession,
        cloudRemote.rawUrl,
        updateCloudSession,
        desktopCloudApiBaseUrl,
      ).then((candidate) => {
        if (cancelled) return;
        apply({
          projectId: null,
          candidateProjectId: candidate.project_id,
          candidateScopeId: candidate.scope_id,
          bindingId: null,
          bindingKind: candidate.binding_kind,
          scopePath: null,
          cloudLinked: true,
          error: LEGACY_CONFIRMATION_MESSAGE,
          reason: "legacy-confirmation-required",
        });
      }).catch((error) => {
        if (cancelled) return;
        apply({
          projectId: null,
          cloudLinked: true,
          error: error instanceof Error ? error.message : String(error),
          reason: errorStatus(error) === 401 ? "wrong-account" : "unresolvable",
        });
      });
      return () => { cancelled = true; };
    }

    if (!configOrigin || !sameCloudOrigin(configOrigin, desktopCloudApiBaseUrl ?? activeCloudSession?.api_base_url)) {
      apply({
        projectId: null,
        candidateProjectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: `Switch to the Cloud host used by this binding (${configOrigin ?? "unknown"}).`,
        reason: "wrong-host",
      });
      return undefined;
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
        error: "This binding belongs to a different local checkout. Attach this checkout explicitly.",
        reason: "binding-revoked",
      });
      return undefined;
    }
    if (!activeCloudSession) {
      apply({
        projectId: configProjectId,
        bindingId: configBindingId,
        cloudLinked: true,
        error: null,
        reason: null,
      });
      return undefined;
    }

    let cancelled = false;
    void (async () => {
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
          })
        ) {
          apply({
            projectId: null,
            candidateProjectId: configProjectId,
            bindingId: configBindingId,
            cloudLinked: true,
            error: "Cloud returned a binding that does not match this local workspace.",
            reason: "binding-revoked",
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
            bindingKind: binding.binding_kind,
            scopePath: binding.scope_path ?? null,
            cloudLinked: true,
            error: reason === "wrong-account" ? "Switch to the account that attached this folder." : FORBIDDEN_MESSAGE,
            reason,
          });
          return;
        }

        const [project, readiness] = await Promise.all([
          getCloudProject(activeCloudSession, configProjectId, updateCloudSession, desktopCloudApiBaseUrl),
          getCloudProjectReadiness(activeCloudSession, configProjectId, updateCloudSession, desktopCloudApiBaseUrl),
        ]);
        if (cancelled) return;
        setHomeCloudProjects((projects) => upsertProject(projects, project));
        apply({
          projectId: configProjectId,
          bindingId: binding.id,
          bindingKind: binding.binding_kind,
          scopePath: binding.scope_path ?? null,
          readiness,
          capabilities: project.capabilities ?? [],
          cloudLinked: true,
          error: null,
          reason: null,
        });
      } catch (error) {
        if (cancelled) return;
        const status = errorStatus(error);
        apply({
          projectId: status == null ? configProjectId : null,
          candidateProjectId: configProjectId,
          bindingId: configBindingId,
          cloudLinked: true,
          error: status === 401
            ? "Switch accounts to use this Cloud binding."
            : status === 403 || status === 404
              ? FORBIDDEN_MESSAGE
              : error instanceof Error ? error.message : String(error),
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
    activeCloudSession,
    activeGitStatus,
    cloudEnabled,
    desktopCloudApiBaseUrl,
    puppyoneConfig,
    setHomeCloudProjects,
    setRecentWorkspaceCloudBindings,
    updateCloudSession,
    workspace,
    workspaceIsCloud,
  ]);
}

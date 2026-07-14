import type { CloudWorkspaceSection } from "../routes/cloudRouteIds";
import type { DesktopCloudProjectReadiness } from "../../../lib/cloudApi";
import { cloudMessage, type CloudMessageDescriptor } from "../cloudPresentation";

export type ProjectCloudAttachment =
  | { status: "local-only"; projectId: null }
  | { status: "resolving"; projectId: null }
  | {
      status: "resolved";
      projectId: string;
      resolutionSource: "workspace-binding" | "canonical-remote";
      bindingStatus: "bound" | "not-bound";
      bindingId?: string | null;
      bindingKind?: "full" | "scoped" | null;
      scopeId?: string | null;
      scopePath?: string | null;
      readiness?: DesktopCloudProjectReadiness | null;
      capabilities?: string[];
      warning?: CloudMessageDescriptor;
    }
  | { status: "not-authorized"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "wrong-account"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "wrong-host"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "binding-revoked"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "role-downgraded"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "locator-conflict"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "not-found"; projectId: string | null; message: CloudMessageDescriptor }
  | { status: "temporarily-unavailable"; projectId: string | null; message: CloudMessageDescriptor }
  | {
      status: "legacy-confirmation-required";
      projectId: string | null;
      scopeId: string | null;
      bindingKind: "full" | "scoped" | null;
      message: CloudMessageDescriptor;
    }
  | { status: "unresolvable"; projectId: null; message: CloudMessageDescriptor }
  | { status: "error"; projectId: null; message: CloudMessageDescriptor };

/** Exact authorized Project context — auth/offline/expired live on CloudAuthState. */
export function getResolvedCloudProjectId(attachment: ProjectCloudAttachment): string | null {
  if (attachment.status === "resolved") return attachment.projectId;
  return null;
}

/** Durable WorkspaceBinding identity only. */
export function getAttachedCloudProjectId(attachment: ProjectCloudAttachment): string | null {
  if (attachment.status === "resolved" && attachment.bindingStatus === "bound") {
    return attachment.projectId;
  }
  return null;
}

export function isProjectCloudLinked(attachment: ProjectCloudAttachment): boolean {
  return Boolean(getAttachedCloudProjectId(attachment));
}

export function attachmentHasBoundProject(attachment: ProjectCloudAttachment): boolean {
  return Boolean(getAttachedCloudProjectId(attachment));
}

export function attachmentHasProjectContext(attachment: ProjectCloudAttachment): boolean {
  return Boolean(getResolvedCloudProjectId(attachment));
}

export function isCloudAttachmentRecovery(
  attachment: ProjectCloudAttachment,
): attachment is Extract<ProjectCloudAttachment, {
  status:
    | "not-authorized"
    | "wrong-account"
    | "wrong-host"
    | "binding-revoked"
    | "role-downgraded"
    | "locator-conflict"
    | "not-found"
    | "temporarily-unavailable"
    | "legacy-confirmation-required"
    | "unresolvable"
    | "error";
}> {
  return attachment.status === "not-authorized"
    || attachment.status === "wrong-account"
    || attachment.status === "wrong-host"
    || attachment.status === "binding-revoked"
    || attachment.status === "role-downgraded"
    || attachment.status === "locator-conflict"
    || attachment.status === "not-found"
    || attachment.status === "temporarily-unavailable"
    || attachment.status === "legacy-confirmation-required"
    || attachment.status === "unresolvable"
    || attachment.status === "error";
}

export function getCloudAttachmentWarning(attachment: ProjectCloudAttachment): CloudMessageDescriptor | null {
  if (attachment.status === "resolved") return attachment.warning ?? null;
  if (isCloudAttachmentRecovery(attachment)) {
    return attachment.message;
  }
  return null;
}

export function resolveProjectCloudAttachment({
  resolvedProjectId,
  remoteProjectId,
  bindingError,
  bindingReason = null,
  bindingCloudLinked,
  resolving,
  bindingId = null,
  bindingKind = null,
  scopePath = null,
  readiness = null,
  capabilities = [],
  scopeId = null,
  resolutionSource = null,
  bindingStatus = null,
}: {
  resolvedProjectId: string | null;
  remoteProjectId: string | null;
  bindingError: CloudMessageDescriptor | null;
  bindingReason?:
    | "not-authorized"
    | "unresolvable"
    | "network"
    | "binding-revoked"
    | "wrong-account"
    | "wrong-host"
    | "role-downgraded"
    | "legacy-confirmation-required"
    | "locator-conflict"
    | "not-found"
    | null;
  bindingCloudLinked: boolean;
  resolving: boolean;
  bindingId?: string | null;
  bindingKind?: "full" | "scoped" | null;
  scopePath?: string | null;
  readiness?: DesktopCloudProjectReadiness | null;
  capabilities?: string[];
  scopeId?: string | null;
  resolutionSource?: "workspace-binding" | "canonical-remote" | null;
  bindingStatus?: "bound" | "not-bound" | null;
}): ProjectCloudAttachment {
  const projectId = resolutionSource && bindingStatus
    ? resolvedProjectId?.trim() || null
    : null;

  // Only a verified binding or authorized canonical resolver result can
  // promote a Project id into resolved context.
  if (projectId && resolutionSource && bindingStatus) {
    const bindingDetails = {
      resolutionSource,
      bindingStatus,
      ...(bindingId ? { bindingId } : {}),
      ...(bindingKind ? { bindingKind } : {}),
      ...(scopeId ? { scopeId } : {}),
      ...(scopePath ? { scopePath } : {}),
      ...(readiness ? { readiness } : {}),
      ...(capabilities.length > 0 ? { capabilities } : {}),
    };
    return bindingError
      ? { status: "resolved", projectId, ...bindingDetails, warning: bindingError }
      : { status: "resolved", projectId, ...bindingDetails };
  }

  if (bindingError) {
    if (bindingReason === "not-authorized") {
      return {
        status: "not-authorized",
        projectId: remoteProjectId?.trim() || null,
        message: bindingError,
      };
    }
    if (
      bindingReason === "wrong-account"
      || bindingReason === "wrong-host"
      || bindingReason === "binding-revoked"
      || bindingReason === "role-downgraded"
      || bindingReason === "legacy-confirmation-required"
      || bindingReason === "locator-conflict"
      || bindingReason === "not-found"
    ) {
      if (bindingReason === "legacy-confirmation-required") {
        return {
          status: bindingReason,
          projectId: remoteProjectId?.trim() || null,
          scopeId,
          bindingKind,
          message: bindingError,
        };
      }
      return {
        status: bindingReason,
        projectId: remoteProjectId?.trim() || null,
        message: bindingError,
      };
    }
    if (bindingReason === "network") {
      return {
        status: "temporarily-unavailable",
        projectId: remoteProjectId?.trim() || null,
        message: bindingError,
      };
    }
    if (bindingReason === "unresolvable" || bindingCloudLinked) {
      return {
        status: "unresolvable",
        projectId: null,
        message: bindingError,
      };
    }
    return {
      status: "error",
      projectId: null,
      message: bindingError,
    };
  }

  if (resolving) {
    return { status: "resolving", projectId: null };
  }

  if (bindingCloudLinked) {
    return {
      status: "unresolvable",
      projectId: null,
      message: cloudMessage("binding-unknown-remote"),
    };
  }

  return { status: "local-only", projectId: null };
}

export function resolveCloudHubSectionForAttachment(
  attachment: ProjectCloudAttachment,
): "overview" | "contents" {
  return attachmentHasProjectContext(attachment) ? "contents" : "overview";
}

export function resolveCloudProjectNavigationContext(
  attachment: ProjectCloudAttachment,
): { projectContext: boolean; localWorkspaceContext: boolean } {
  const projectContext = attachmentHasProjectContext(attachment);
  return {
    projectContext,
    localWorkspaceContext: projectContext,
  };
}

export function resolveCloudHubSectionAfterBindingChange({
  currentSection,
  hasBoundProject,
  workspaceChanged,
}: {
  currentSection: CloudWorkspaceSection;
  hasBoundProject: boolean;
  workspaceChanged: boolean;
}): CloudWorkspaceSection {
  if (workspaceChanged) return hasBoundProject ? "contents" : "overview";
  if (!hasBoundProject) return "overview";
  return currentSection === "overview" ? "contents" : currentSection;
}

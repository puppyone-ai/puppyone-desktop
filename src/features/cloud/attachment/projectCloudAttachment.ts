import type { CloudWorkspaceSection } from "../routes/cloudRouteIds";

export type ProjectCloudAttachment =
  | { status: "local-only"; projectId: null }
  | { status: "resolving"; projectId: null }
  | { status: "linked"; projectId: string; warning?: string }
  | { status: "not-authorized"; projectId: string | null; message: string }
  | { status: "unresolvable"; projectId: null; message: string }
  | { status: "error"; projectId: null; message: string };

/** Binding identity only — auth/offline/expired live on CloudAuthState. */
export function getAttachedCloudProjectId(attachment: ProjectCloudAttachment): string | null {
  if (attachment.status === "linked") return attachment.projectId;
  return null;
}

export function isProjectCloudLinked(attachment: ProjectCloudAttachment): boolean {
  return attachment.status === "linked";
}

export function attachmentHasBoundProject(attachment: ProjectCloudAttachment): boolean {
  return Boolean(getAttachedCloudProjectId(attachment));
}

export function isCloudAttachmentRecovery(
  attachment: ProjectCloudAttachment,
): attachment is Extract<ProjectCloudAttachment, { status: "not-authorized" | "unresolvable" | "error" }> {
  return attachment.status === "not-authorized"
    || attachment.status === "unresolvable"
    || attachment.status === "error";
}

export function getCloudAttachmentWarning(attachment: ProjectCloudAttachment): string | null {
  if (attachment.status === "linked") return attachment.warning ?? null;
  if (attachment.status === "not-authorized" || attachment.status === "unresolvable" || attachment.status === "error") {
    return attachment.message;
  }
  return null;
}

export function resolveProjectCloudAttachment({
  configuredProjectId,
  bindingProjectId,
  remoteProjectId,
  bindingError,
  bindingReason = null,
  bindingCloudLinked,
  resolving,
}: {
  configuredProjectId: string | null;
  bindingProjectId: string | null;
  remoteProjectId: string | null;
  bindingError: string | null;
  bindingReason?: "not-authorized" | "unresolvable" | "network" | null;
  bindingCloudLinked: boolean;
  resolving: boolean;
}): ProjectCloudAttachment {
  const projectId = configuredProjectId?.trim()
    || bindingProjectId?.trim()
    || null;

  // A known durable binding stays linked on network/resolver warnings.
  // Remote-only candidate ids are NOT treated as verified bindings.
  if (projectId) {
    return bindingError
      ? { status: "linked", projectId, warning: bindingError }
      : { status: "linked", projectId };
  }

  if (bindingError) {
    if (bindingReason === "not-authorized") {
      return {
        status: "not-authorized",
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
      message: "We found a PuppyOne Cloud remote, but couldn’t identify its project.",
    };
  }

  return { status: "local-only", projectId: null };
}

export function resolveCloudHubSectionForAttachment(
  attachment: ProjectCloudAttachment,
): "overview" | "contents" {
  return attachmentHasBoundProject(attachment) ? "contents" : "overview";
}

export function resolveCloudProjectNavigationContext(
  attachment: ProjectCloudAttachment,
  selectedProjectId: string | null,
): { projectContext: boolean; projectBound: boolean } {
  const attachmentBound = attachmentHasBoundProject(attachment);
  // Stale browse selection must never override a formal local binding, and must
  // not invent project context when a recovery/local-only state is active.
  const browsingProject = Boolean(selectedProjectId?.trim()) && !attachmentBound
    && attachment.status === "local-only";
  return {
    projectContext: attachmentBound || browsingProject,
    projectBound: attachmentBound,
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

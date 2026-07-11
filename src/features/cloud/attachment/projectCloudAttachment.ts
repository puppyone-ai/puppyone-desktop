import type { CloudWorkspaceSection } from "../routes/cloudRouteIds";

export type ProjectCloudAttachment =
  | { status: "local-only"; projectId: null }
  | { status: "resolving"; projectId: null }
  | { status: "linked"; projectId: string; warning?: string }
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

export function resolveProjectCloudAttachment({
  configuredProjectId,
  bindingProjectId,
  remoteProjectId,
  bindingError,
  bindingCloudLinked,
  resolving,
}: {
  configuredProjectId: string | null;
  bindingProjectId: string | null;
  remoteProjectId: string | null;
  bindingError: string | null;
  bindingCloudLinked: boolean;
  resolving: boolean;
}): ProjectCloudAttachment {
  const projectId = configuredProjectId?.trim()
    || bindingProjectId?.trim()
    || remoteProjectId?.trim()
    || null;

  // A resolver/network failure is diagnostic once local identity is known; it
  // must not demote a durable binding into an unbound navigation state.
  if (projectId) {
    return bindingError
      ? { status: "linked", projectId, warning: bindingError }
      : { status: "linked", projectId };
  }

  if (bindingError) {
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
      status: "error",
      projectId: null,
      message: "Cloud project link could not be resolved.",
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
  const browsingProject = Boolean(selectedProjectId?.trim());
  return {
    projectContext: attachmentBound || browsingProject,
    projectBound: attachmentBound && !browsingProject,
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

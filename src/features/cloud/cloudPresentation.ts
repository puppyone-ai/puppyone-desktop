import { bidiIsolate, type MessageFormatter } from "@puppyone/localization/core";
import type { CloudAccessSurface } from "./model";
import type {
  CloudBranchGraphDiagnostics,
  CloudBranchGraphLabel,
  CloudBranchGraphRow,
} from "./graph/model";
import type { CloudPublishErrorCode } from "../../types/electron";
import { normalizeProviderKey } from "./utils";

export type CloudMessageCode =
  | "project-linked"
  | "clone-command-copied"
  | "cloud-remote-removed"
  | "workspace-unavailable"
  | "connect-failed"
  | "copy-clone-failed"
  | "remove-remote-failed"
  | "save-scope-failed"
  | "rotate-key-failed"
  | "delete-access-failed"
  | "create-mcp-failed"
  | "update-config-failed"
  | "cli-unavailable"
  | "mcp-unavailable"
  | "organization-partial"
  | "organization-load-failed"
  | "create-access-failed"
  | "cloud-data-load-failed"
  | "project-details-partial"
  | "access-load-failed"
  | "access-partial"
  | "history-load-failed"
  | "history-load-more-failed"
  | "history-degraded-count"
  | "history-degraded"
  | "git-topology-load-failed"
  | "auth-start-failed"
  | "auth-signout-failed"
  | "auth-signed-out"
  | "remote-sign-in"
  | "remote-wrong-host"
  | "remote-response-mismatch"
  | "remote-not-authorized"
  | "remote-unresolvable"
  | "remote-network-failed"
  | "remote-locator-conflict"
  | "remote-not-found"
  | "project-publish-failed"
  | "project-publish-commit-required"
  | "project-publish-branch-required"
  | "project-list-load-failed"
  | "project-open-failed";

export type CloudMessageDescriptor = Readonly<{
  code: CloudMessageCode;
  values?: Readonly<Record<string, string | number>>;
  /** Sanitized server/provider detail. It is preserved, not presented as translated product copy. */
  detail?: string;
}>;

export function cloudMessage(
  code: CloudMessageCode,
  values?: CloudMessageDescriptor["values"],
  detail?: string,
): CloudMessageDescriptor {
  return { code, values, detail };
}

export function formatCloudMessage(message: CloudMessageDescriptor, t: MessageFormatter) {
  const values = message.values
    ? Object.fromEntries(Object.entries(message.values).map(([key, value]) => [
        key,
        typeof value === "string" ? bidiIsolate(value) : value,
      ]))
    : undefined;
  const productMessage = t(`cloud.message.${message.code}`, values);
  return message.detail ? `${productMessage} ${bidiIsolate(message.detail)}` : productMessage;
}

export function formatCloudPublishFailure(
  error: { code: CloudPublishErrorCode; retryable: boolean },
  t: MessageFormatter,
): string {
  if (error.code === "SESSION_REQUIRED") return t("cloud.initialize.signInNote");
  if (error.code === "ORGANIZATION_REQUIRED") return t("cloud.initialize.organizationRequired");
  if (error.code === "REPOSITORY_REQUIRED" || error.code === "COMMIT_REQUIRED") {
    return t("cloud.message.project-publish-commit-required");
  }
  if (error.code === "BRANCH_REQUIRED") return t("cloud.message.project-publish-branch-required");
  if (error.code === "SOURCE_MISSING") return t("cloud.initialize.sourceMissing");
  if (error.code === "IDENTITY_MISMATCH") return t("cloud.initialize.repositoryIdentityMismatch");
  if (error.code === "REMOTE_CONFLICT") return t("cloud.initialize.remoteConflict");
  if (error.code === "REMOTE_REF_CONFLICT") return t("cloud.initialize.pushConflictDescription");
  if (error.code === "PUSH_UNCERTAIN") return t("cloud.initialize.pushUncertainDescription");
  if (error.code === "CLEANUP_FAILED" || error.code === "COMPENSATION_FAILED") {
    return t("cloud.initialize.cleanupFailed");
  }
  if (error.code === "PROJECT_UNAVAILABLE") return t("cloud.initialize.projectUnavailable");
  if (error.code === "PERMISSION_DENIED") return t("cloud.initialize.permissionDenied");
  if (error.code === "JOURNAL_CORRUPT" || error.code === "JOURNAL_IO_FAILED") {
    return t("cloud.initialize.localRecoveryFailed");
  }
  return t("cloud.message.project-publish-failed");
}

export function formatCloudAccessSurfaceTitle(surface: CloudAccessSurface, t: MessageFormatter) {
  if (surface.title) return surface.title;
  const provider = normalizeProviderKey(surface.provider);
  if (provider === "cli") return t("cloud.access.surface.cli.title");
  if (provider === "filesystem" || provider === "git" || provider === "git_remote") return t("cloud.access.surface.git.title");
  if (provider === "mcp" || provider === "mcp_endpoint") return t("cloud.access.surface.mcp.title");
  if (provider === "vm" || provider === "remote_workspace" || provider === "sandbox") return t("cloud.access.surface.vm.title");
  return surface.provider;
}

export function formatCloudAccessSurfaceSubtitle(surface: CloudAccessSurface, t: MessageFormatter) {
  if (surface.subtitle) return surface.subtitle;
  const provider = normalizeProviderKey(surface.provider);
  if (provider === "cli") return t("cloud.access.surface.cli.subtitle");
  if (provider === "filesystem" || provider === "git" || provider === "git_remote") return t("cloud.access.surface.git.subtitle");
  return "";
}

export function formatCloudAccessSurfacePrompt(
  surface: CloudAccessSurface,
  scopeName: string,
  t: MessageFormatter,
) {
  if (surface.prompt) return surface.prompt;
  const provider = normalizeProviderKey(surface.provider);
  if (provider === "cli") return t("cloud.access.surface.cli.prompt", { scope: bidiIsolate(scopeName) });
  if (provider === "filesystem" || provider === "git" || provider === "git_remote") {
    return t("cloud.access.surface.git.prompt");
  }
  if (provider === "mcp" || provider === "mcp_endpoint") return t("cloud.access.surface.mcp.prompt");
  if (provider === "vm" || provider === "remote_workspace" || provider === "sandbox") {
    return t("cloud.access.surface.vm.prompt");
  }
  return t("cloud.access.surface.generic.prompt");
}

export function formatCloudAccessCommandLabel(
  command: NonNullable<CloudAccessSurface["commands"]>[number],
  t: MessageFormatter,
) {
  return t(`cloud.access.command.${command.id}`);
}

export function formatCloudAccessAggregate(code: "error" | "syncing" | "active" | "mixed" | "paused", t: MessageFormatter) {
  return t(`cloud.access.aggregate.${code}`);
}

export function formatCloudGraphRowMessage(row: CloudBranchGraphRow, t: MessageFormatter) {
  return row.message || (row.messageCode ? t(`cloud.graph.message.${row.messageCode}`) : t("cloud.history.updateWorkspace"));
}

export function formatCloudGraphAuthor(row: CloudBranchGraphRow, t: MessageFormatter) {
  return row.authorName || (row.authorCode ? t(`cloud.graph.author.${row.authorCode}`) : t("cloud.status.unknown"));
}

export function formatCloudGraphLabel(label: CloudBranchGraphLabel, t: MessageFormatter) {
  return label.name || (label.nameCode ? t(`cloud.graph.label.${label.nameCode}`) : "");
}

export function formatCloudGraphWarning(
  diagnostics: CloudBranchGraphDiagnostics,
  t: MessageFormatter,
) {
  return diagnostics.warningCode
    ? t(`cloud.graph.warning.${diagnostics.warningCode}`)
    : diagnostics.warning;
}

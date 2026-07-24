import type { MessageFormatter } from "@puppyone/localization/core";
import type {
  CloudPublishErrorCode,
  CloudPublishState,
} from "../../../types/electron";

export type CloudPushAction = "retry-push" | "push-latest" | "choose-source" | "reconcile";

export function isCloudPublishPrerequisiteFailure(code: CloudPublishErrorCode): boolean {
  return code === "REPOSITORY_REQUIRED"
    || code === "COMMIT_REQUIRED"
    || code === "BRANCH_REQUIRED";
}

export function getCloudInitializationStatusLabel(
  state: CloudPublishState,
  t: MessageFormatter,
): string {
  if (["requested", "deleting", "failed"].includes(state.cleanup)) {
    return t("cloud.initialize.status.cleanupPending");
  }
  if (state.push === "uncertain") return t("cloud.initialize.status.pushUncertain");
  if (state.push === "conflict") return t("cloud.initialize.status.pushConflict");
  if (state.project === "unavailable") return t("cloud.initialize.projectUnavailable");
  if (state.project === "empty" && state.push === "failed") return t("cloud.initialize.status.emptyPushFailed");
  if (state.project === "empty") return t("cloud.initialize.status.empty");
  if (state.push === "accepted" || state.project === "published") return t("cloud.initialize.status.published");
  return t("cloud.initialize.status.preparing");
}

export function getCloudInitializationDescription(
  state: CloudPublishState,
  t: MessageFormatter,
): string {
  if (["requested", "deleting", "failed"].includes(state.cleanup)) {
    return t("cloud.initialize.cleanupPendingDescription", { project: state.projectName });
  }
  if (state.push === "uncertain") return t("cloud.initialize.pushUncertainDescription");
  if (state.push === "conflict") return t("cloud.initialize.pushConflictDescription");
  if (state.project === "unavailable") return t("cloud.initialize.projectUnavailable");
  if (state.local === "source-missing") {
    return t("cloud.initialize.sourceMissingDescription", { branch: state.selectedSourceBranch });
  }
  if (state.local === "source-advanced") {
    return t("cloud.initialize.sourceAdvancedDescription", { branch: state.selectedSourceBranch });
  }
  return t("cloud.initialize.emptyProjectDescription", { project: state.projectName });
}

export function getCloudInitializationActionLabel(
  action: CloudPushAction,
  t: MessageFormatter,
): string {
  if (action === "push-latest") return t("cloud.initialize.pushLatestCommit");
  if (action === "choose-source") return t("cloud.initialize.useCurrentBranch");
  if (action === "reconcile") return t("cloud.initialize.checkCloudStatus");
  return t("cloud.initialize.retryPush");
}

export function getCloudPushAction(
  actions: CloudPublishState["availableActions"],
): CloudPushAction | null {
  if (actions.includes("reconcile")) return "reconcile";
  if (actions.includes("choose-source")) return "choose-source";
  if (actions.includes("push-latest")) return "push-latest";
  if (actions.includes("retry-push")) return "retry-push";
  return null;
}

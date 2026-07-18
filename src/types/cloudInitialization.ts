import type { GitStatusSnapshot } from "./electron";

export type CloudInitializationProjectState =
  | "absent"
  | "creating"
  | "empty"
  | "published"
  | "deleting"
  | "deleted"
  | "unavailable";

export type CloudInitializationPushState =
  | "idle"
  | "preparing"
  | "uploading"
  | "confirming"
  | "accepted"
  | "failed"
  | "uncertain"
  | "conflict";

export type CloudInitializationLocalState =
  | "clean"
  | "dirty"
  | "source-advanced"
  | "source-missing"
  | "branch-switched"
  | "remote-conflict";

export type CloudInitializationCleanupState =
  | "none"
  | "requested"
  | "deleting"
  | "failed"
  | "completed";

export type CloudInitializationAction =
  | "retry-push"
  | "push-latest"
  | "choose-source"
  | "reconcile"
  | "delete-empty-project"
  | "finish-cleanup";

export type CloudInitializationProgressStage =
  | "validating"
  | "creating-project"
  | "securing-credential"
  | "configuring-remote"
  | "checking-remote"
  | "uploading"
  | "confirming"
  | "finalizing"
  | "completed";

export type CloudInitializationErrorCode =
  | "SESSION_REQUIRED"
  | "IDENTITY_MISMATCH"
  | "ORGANIZATION_REQUIRED"
  | "REPOSITORY_REQUIRED"
  | "COMMIT_REQUIRED"
  | "BRANCH_REQUIRED"
  | "SOURCE_MISSING"
  | "MERGE_TIP_UNSUPPORTED"
  | "LFS_UNSUPPORTED"
  | "REMOTE_CONFLICT"
  | "REMOTE_REF_CONFLICT"
  | "PROJECT_CREATE_FAILED"
  | "PROJECT_UNAVAILABLE"
  | "CREDENTIAL_FAILED"
  | "REMOTE_CONFIG_FAILED"
  | "PUSH_FAILED"
  | "PUSH_UNCERTAIN"
  | "LOCAL_FINALIZE_FAILED"
  | "CLEANUP_FAILED"
  | "COMPENSATION_FAILED"
  | "JOURNAL_CORRUPT"
  | "JOURNAL_IO_FAILED"
  | "PERMISSION_DENIED"
  | "UNKNOWN";

export type CloudInitializationState = {
  operationId: string;
  session: "signed-in";
  project: CloudInitializationProjectState;
  push: CloudInitializationPushState;
  local: CloudInitializationLocalState;
  cleanup: CloudInitializationCleanupState;
  projectId: string | null;
  projectName: string;
  organizationId: string;
  selectedSourceBranch: string;
  selectedSourceRef: string;
  latestSourceCommitOid: string | null;
  attemptId: string | null;
  attemptCommitOid: string | null;
  attemptCount: number;
  destinationBranch: "main";
  hasUncommittedChanges: boolean;
  currentBranch: string | null;
  lastError: {
    code: CloudInitializationErrorCode;
    retryable: boolean;
    occurredAt: string;
  } | null;
  availableActions: CloudInitializationAction[];
  createdAt: string;
  updatedAt: string;
};

export type CloudInitializationProgress = {
  rootPath: string;
  operationId: string | null;
  stage: CloudInitializationProgressStage;
  state: CloudInitializationState | null;
  updatedAt: string;
};

export type CloudInitializationResult =
  | {
    ok: true;
    state: CloudInitializationState | null;
    gitStatus?: GitStatusSnapshot;
  }
  | {
    ok: false;
    state: CloudInitializationState | null;
    error: {
      code: CloudInitializationErrorCode;
      retryable: boolean;
      message?: string;
    };
  };

export type CloudInitializationIdentityRequest = {
  rootPath: string;
  apiBaseUrl: string;
  userId: string;
};

export type CloudInitializationStartRequest = CloudInitializationIdentityRequest & {
  organizationId: string;
  projectName: string;
  sourceBranch: string;
  operationId?: string | null;
  action: "initialize" | "retry-push" | "push-latest" | "choose-source" | "reconcile";
};

export type CloudInitializationCleanupRequest = CloudInitializationIdentityRequest & {
  operationId: string;
};

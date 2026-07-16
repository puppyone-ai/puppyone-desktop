import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getWorkspaceGitStatus,
  resolveGitRepositoryIdentity,
} from "../../local-api/workspace.mjs";
import {
  GIT_MUTATION_TIMEOUT_MS,
  GIT_NETWORK_TIMEOUT_MS,
  execGit,
  execGitBuffer,
} from "../../local-api/git/runner.mjs";
import { normalizeCloudApiBaseUrl } from "../../shared/cloudEndpoint.js";
import {
  createGitOperationCoordinator,
  repositoryLockKey,
} from "./git-operation-coordinator.mjs";
import { createCloudPublishGitCredentialManager } from "./cloud-publish-git-credentials.mjs";
import { createCloudPublishJournal } from "./cloud-publish-journal.mjs";

const CLOUD_REMOTE_NAME = "puppyone";
const CLOUD_DESTINATION_BRANCH = "main";
const CLOUD_GIT_USERNAME = "x-puppyone-token";
const LFS_POINTER_PREAMBLE = "version https://git-lfs.github.com/spec/v1";
const LFS_POINTER_MAX_BYTES = 512;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export const CLOUD_PUBLISH_ERROR_CODES = Object.freeze([
  "SESSION_REQUIRED",
  "IDENTITY_MISMATCH",
  "ORGANIZATION_REQUIRED",
  "REPOSITORY_REQUIRED",
  "COMMIT_REQUIRED",
  "BRANCH_REQUIRED",
  "MERGE_TIP_UNSUPPORTED",
  "LFS_UNSUPPORTED",
  "REMOTE_CONFLICT",
  "PROJECT_CREATE_FAILED",
  "CREDENTIAL_FAILED",
  "REMOTE_CONFIG_FAILED",
  "PUSH_FAILED",
  "COMPENSATION_FAILED",
  "JOURNAL_CORRUPT",
  "JOURNAL_IO_FAILED",
  "PERMISSION_DENIED",
  "UNKNOWN",
]);

/**
 * Durable publish saga. All network identity and raw credentials stay in main.
 * The renderer receives only a typed state machine and sanitized diagnostics.
 */
export function createCloudPublishCoordinator({
  cloudAuthService,
  secretVault,
  journal = createCloudPublishJournal(),
  gitOperationCoordinator = createGitOperationCoordinator(),
  gitCredentialManager = createCloudPublishGitCredentialManager(),
  execGitCommand = execGit,
  execGitBufferCommand = execGitBuffer,
  getGitStatus = getWorkspaceGitStatus,
  resolveRepositoryIdentity = resolveGitRepositoryIdentity,
  fsApi = fs.promises,
  randomUUID = crypto.randomUUID,
  randomBytes = crypto.randomBytes,
  now = () => Date.now(),
  faultInjector = async () => undefined,
  validateRemoteUrl = validateCanonicalCloudGitRemoteUrl,
  configuredGitOrigin = process.env.VITE_DESKTOP_CLOUD_GIT_ORIGIN ?? null,
} = {}) {
  if (!cloudAuthService?.readSession || !cloudAuthService?.requestSessionApi) {
    throw new TypeError("Cloud publish coordinator requires cloudAuthService.");
  }
  if (!secretVault?.createRef || !secretVault?.put || !secretVault?.get || !secretVault?.clear) {
    throw new TypeError("Cloud publish coordinator requires a main-only SecretVault.");
  }

  const inflight = new Map();

  const resolveContext = (rootPath) => resolveRepositoryContext(rootPath, {
    resolveRepositoryIdentity,
    fsApi,
  });

  const refreshContext = (rootPath, initial) => refreshRepositoryContext(rootPath, initial, {
    resolveRepositoryIdentity,
    fsApi,
  });

  async function assertActiveSession(base, record = null) {
    const session = await cloudAuthService.readSession();
    const sessionApiBase = normalizeCloudApiBaseUrl(session?.api_base_url);
    if (
      !session
      || typeof session.user_id !== "string"
      || session.user_id !== base.userId
      || sessionApiBase !== base.apiBaseUrl
      || (record && (record.user_id !== session.user_id || record.api_base_url !== sessionApiBase))
    ) {
      throw createPublishError(
        "SESSION_REQUIRED",
        "Sign in with the Cloud account that owns this publish operation.",
        true,
      );
    }
    return session;
  }

  async function getState(request = {}) {
    try {
      const base = normalizeReadRequest(request);
      const context = await resolveContext(base.rootPath);
      await gitOperationCoordinator.whenIdle(repositoryLockKey(context.identity.commonDir));
      return await readStateUnderLock(base, context);
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      return failureResult(error, null);
    }
  }

  async function startOrResume(request = {}) {
    let base;
    let context;
    try {
      base = normalizeStartRequest(request);
      context = await resolveContext(base.rootPath);
    } catch (error) {
      return failureResult(error, null);
    }
    const key = context.identity.gitDir;
    const fingerprint = requestFingerprint(base);
    const active = inflight.get(key);
    if (active) {
      if (active.fingerprint === fingerprint) return active.promise;
      return failureResult(createPublishError(
        "IDENTITY_MISMATCH",
        "A different Cloud publish operation is already running for this worktree.",
        false,
      ), null);
    }

    const promise = gitOperationCoordinator
      .run(repositoryLockKey(context.identity.commonDir), () => runPublishUnderLock(base, context))
      .finally(() => {
        if (inflight.get(key)?.promise === promise) inflight.delete(key);
      });
    inflight.set(key, { fingerprint, promise });
    return promise;
  }

  async function abandon(request = {}) {
    let base;
    let context;
    try {
      base = normalizeAbandonRequest(request);
      context = await resolveContext(base.rootPath);
    } catch (error) {
      return failureResult(error, null);
    }
    const key = context.identity.gitDir;
    if (inflight.has(key)) {
      return failureResult(createPublishError(
        "COMPENSATION_FAILED",
        "Wait for the current publish attempt to finish before abandoning it.",
        true,
      ), null);
    }
    return gitOperationCoordinator
      .run(repositoryLockKey(context.identity.commonDir), () => runAbandonUnderLock(base, context))
      .catch((error) => {
        if (isSimulatedCrash(error)) throw error;
        return failureResult(error, null);
      });
  }

  async function readStateUnderLock(base, initialContext) {
    let loaded;
    try {
      loaded = await journal.read(base.rootPath);
    } catch (error) {
      return failureResult(error, null);
    }
    if (!loaded.record) return successResult(null);
    const record = loaded.record;
    try {
      const context = await refreshContext(base.rootPath, initialContext);
      await assertActiveSession(base, record);
      assertJournalReadIdentity(record, base, context);
      if (record.phase === "completed") {
        const status = await getGitStatus(base.rootPath);
        const state = toPublicState(record, { identityMatches: true });
        await cleanupCompletedOperation(base.rootPath, record);
        return successResult(state, status);
      }
      const status = await getGitStatus(base.rootPath);
      const identityMatches = statusMatchesRecord(status, record);
      const state = toPublicState(record, { identityMatches });
      if (!identityMatches) {
        return failureResult(createPublishError(
          "IDENTITY_MISMATCH",
          "The local branch or HEAD no longer matches the pending Cloud publish operation.",
          false,
        ), state);
      }
      return successResult(state);
    } catch (error) {
      return failureResult(error, toPublicState(record, { identityMatches: false }));
    }
  }

  async function runPublishUnderLock(base, initialContext) {
    let record = null;
    try {
      const context = await refreshContext(base.rootPath, initialContext);
      const session = await assertActiveSession(base);
      const loaded = await journal.read(base.rootPath);
      record = loaded.record;

      if (!record) {
        const status = await getGitStatus(base.rootPath);
        assertFreshPublishStatus(status, base);
        await assertNoCloudRemote(base.rootPath, execGitCommand);
        await assertVersionEnginePreflight(base.rootPath, base.expectedHeadCommitId, {
          execGitCommand,
          execGitBufferCommand,
        });
        record = createInitialRecord(base, context, session, now, randomUUID);
        await journal.write(base.rootPath, record, { createOnly: true });
        await injectFault("after-prepared", record);
      } else {
        assertJournalStartIdentity(record, base, context, session);
        if (record.phase === "compensation-pending") {
          throw createPublishError(
            "COMPENSATION_FAILED",
            "This publish operation is being abandoned. Retry Abandon to finish cleanup.",
            true,
          );
        }
        if (record.phase === "completed") {
          const status = await getGitStatus(base.rootPath);
          const completed = toPublicState(record, { identityMatches: true });
          await cleanupCompletedOperation(base.rootPath, record);
          return successResult(completed, status);
        }
        const status = await getGitStatus(base.rootPath);
        assertExpectedStatus(status, record);
        await assertVersionEnginePreflight(base.rootPath, record.expected_head_commit_id, {
          execGitCommand,
          execGitBufferCommand,
        });
        await assertResumeRemoteState(base.rootPath, record, execGitCommand);
      }

      if (record.phase === "prepared") {
        const project = await requestProjectCreate(record);
        await injectFault("after-project-response", record);
        const projectId = validateCreatedProject(project, record);
        record = await persist(base.rootPath, record, {
          phase: "project-created",
          project_id: projectId,
        });
        await injectFault("after-project-created", record);
      }

      if (record.phase === "project-created") {
        const secret = await ensureCredentialSecret(base.rootPath, record);
        record = secret.record;
        const issued = await requestCredential(record, secret.value);
        await injectFault("after-credential-response", record);
        const credential = validateIssuedCredential(issued, record, secret.value, {
          configuredGitOrigin,
          validateRemoteUrl,
        });
        record = await persist(base.rootPath, record, {
          phase: "credential-issued",
          credential_id: credential.id,
          canonical_remote_url: credential.remoteUrl,
          credential_username: credential.username,
        });
        await injectFault("after-credential-issued", record);
      }

      if (record.phase === "credential-issued") {
        const secret = await requireStoredSecret(record);
        const remoteCreated = await configureCanonicalRemote(base.rootPath, record, secret);
        record = await persist(base.rootPath, record, {
          phase: "remote-configured",
          remote_created_by_operation: record.remote_created_by_operation || remoteCreated,
        });
        await injectFault("after-remote-configured", record);
      }

      let status;
      if (record.phase === "remote-configured") {
        const secret = await requireStoredSecret(record);
        status = await pushExpectedCommit(base.rootPath, record, secret);
        record = await persist(base.rootPath, record, { phase: "pushed" });
        await injectFault("after-pushed", record);
      }

      if (record.phase === "pushed") {
        status = status ?? await finalizeUpstreamAndStatus(base.rootPath, record);
        record = await persist(base.rootPath, record, { phase: "completed" });
        await injectFault("after-completed", record);
      }

      const completedState = toPublicState(record, { identityMatches: true });
      await cleanupCompletedOperation(base.rootPath, record);
      return successResult(completedState, status ?? await getGitStatus(base.rootPath));
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      const latest = await journal.read(base.rootPath).then((entry) => entry.record).catch(() => record);
      return failureResult(error, latest ? toPublicState(latest, {
        identityMatches: statusMatchesRequest(base, latest),
      }) : null);
    }
  }

  async function runAbandonUnderLock(base, initialContext) {
    let record = null;
    try {
      const context = await refreshContext(base.rootPath, initialContext);
      const loaded = await journal.read(base.rootPath);
      record = loaded.record;
      if (!record) return successResult(null, await getGitStatus(base.rootPath));
      await assertActiveSession(base, record);
      assertJournalReadIdentity(record, base, context);
      if (record.operation_id !== base.operationId) {
        throw createPublishError(
          "IDENTITY_MISMATCH",
          "The requested operation does not match this worktree's pending publish operation.",
          false,
        );
      }
      if (record.phase === "pushed" || record.phase === "completed") {
        throw createPublishError(
          "COMPENSATION_FAILED",
          "A Project whose initial Git push completed cannot be abandoned as empty.",
          false,
        );
      }
      if (record.phase !== "compensation-pending") {
        record = await persist(base.rootPath, record, { phase: "compensation-pending" });
      }
      await injectFault("after-compensation-pending", record);

      if (record.canonical_remote_url) {
        const remote = await inspectCloudRemote(base.rootPath, execGitCommand);
        if (remote.kind === "exact" && remote.url === record.canonical_remote_url) {
          await execGitCommand(base.rootPath, ["remote", "remove", CLOUD_REMOTE_NAME], {
            timeout: GIT_MUTATION_TIMEOUT_MS,
          });
          await injectFault("after-abandon-remote-removed", record);
        }
        // A missing remote is already compensated. A different remote is not
        // owned by this operation and must never be modified.
      }

      if (record.canonical_remote_url && record.credential_username) {
        await gitCredentialManager.reject(
          base.rootPath,
          record.canonical_remote_url,
          record.credential_username,
        ).catch(() => undefined);
      }

      if (record.project_id) {
        await cloudAuthService.requestSessionApi(
          record.api_base_url,
          `/projects/${encodeURIComponent(record.project_id)}/initialization/abandon`,
          {
            method: "POST",
            headers: { "Idempotency-Key": record.operation_id },
            body: "{}",
          },
        ).catch((error) => {
          throw createPublishError(
            "COMPENSATION_FAILED",
            "Unable to abandon the empty Cloud Project. Retry Abandon.",
            true,
            error,
          );
        });
        await injectFault("after-abandon-response", record);
      }

      if (record.secret_ref) await secretVault.clear(record.secret_ref);
      await journal.clear(base.rootPath);
      return successResult(null, await getGitStatus(base.rootPath));
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      const latest = await journal.read(base.rootPath).then((entry) => entry.record).catch(() => record);
      return failureResult(error, latest ? toPublicState(latest, { identityMatches: false }) : null);
    }
  }

  async function requestProjectCreate(record) {
    try {
      return await cloudAuthService.requestSessionApi(record.api_base_url, "/projects/", {
        method: "POST",
        headers: { "Idempotency-Key": record.operation_id },
        body: JSON.stringify(record.create_payload),
      });
    } catch (error) {
      throw mapCloudMutationError("PROJECT_CREATE_FAILED", "Unable to create the Cloud Project.", error);
    }
  }

  async function requestCredential(record, secret) {
    try {
      return await cloudAuthService.requestSessionApi(
        record.api_base_url,
        `/projects/${encodeURIComponent(record.project_id)}/git-credentials`,
        {
          method: "POST",
          headers: { "Idempotency-Key": record.operation_id },
          body: JSON.stringify({
            target: { kind: "project_root", project_id: record.project_id },
            mode: "rw",
            credential: secret,
          }),
        },
      );
    } catch (error) {
      throw mapCloudMutationError("CREDENTIAL_FAILED", "Unable to issue the Project Git credential.", error);
    }
  }

  async function ensureCredentialSecret(rootPath, current) {
    let record = current;
    if (!record.secret_ref) {
      record = await persist(rootPath, record, {
        secret_ref: secretVault.createRef(),
        secret_stored: false,
      });
      await injectFault("after-secret-ref-journaled", record);
    }
    let secret = await secretVault.get(record.secret_ref).catch((error) => {
      throw createPublishError("CREDENTIAL_FAILED", "Unable to read the protected Git credential.", false, error);
    });
    if (!secret) {
      if (record.secret_stored) {
        throw createPublishError(
          "CREDENTIAL_FAILED",
          "The protected credential for this pending operation is unavailable. Abandon the operation.",
          false,
        );
      }
      secret = `pwg_${randomBytes(32).toString("base64url")}`;
      await secretVault.put(record.secret_ref, secret).catch((error) => {
        throw createPublishError("CREDENTIAL_FAILED", "Unable to protect the Git credential.", false, error);
      });
      await injectFault("after-secret-vault-write", record);
    }
    if (!record.secret_stored) {
      record = await persist(rootPath, record, { secret_stored: true });
    }
    return { record, value: secret };
  }

  async function requireStoredSecret(record) {
    if (!record.secret_ref || !record.secret_stored) {
      throw createPublishError("CREDENTIAL_FAILED", "Pending Git credential state is incomplete.", false);
    }
    const secret = await secretVault.get(record.secret_ref).catch((error) => {
      throw createPublishError("CREDENTIAL_FAILED", "Unable to read the protected Git credential.", false, error);
    });
    if (!secret) {
      throw createPublishError(
        "CREDENTIAL_FAILED",
        "The protected credential for this pending operation is unavailable. Abandon the operation.",
        false,
      );
    }
    return secret;
  }

  async function configureCanonicalRemote(rootPath, record, secret) {
    assertCredentialRecordComplete(record);
    await assertExpectedRepositoryIdentity(rootPath, record, execGitCommand);
    const remote = await inspectCloudRemote(rootPath, execGitCommand);
    if (remote.kind !== "missing" && !(remote.kind === "exact" && remote.url === record.canonical_remote_url)) {
      throw createPublishError(
        "REMOTE_CONFLICT",
        "A Git remote named 'puppyone' already exists with a different canonical URL.",
        false,
      );
    }

    let approval = null;
    try {
      approval = await gitCredentialManager.approve(
        rootPath,
        record.canonical_remote_url,
        record.credential_username,
        secret,
      );
      let created = false;
      if (remote.kind === "missing") {
        await execGitCommand(rootPath, ["remote", "add", CLOUD_REMOTE_NAME, record.canonical_remote_url], {
          timeout: GIT_MUTATION_TIMEOUT_MS,
        });
        created = true;
        await injectFault("after-remote-add", record);
      }
      await assertExpectedRepositoryIdentity(rootPath, record, execGitCommand);
      await assertExactCanonicalRemote(rootPath, record.canonical_remote_url, execGitCommand);
      await execGitCommand(rootPath, ["ls-remote", "--refs", CLOUD_REMOTE_NAME], {
        timeout: GIT_NETWORK_TIMEOUT_MS,
      });
      return created;
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      await approval?.rollback?.().catch(() => undefined);
      if (error?.publishCode) throw error;
      throw createPublishError(
        "REMOTE_CONFIG_FAILED",
        "Unable to configure the canonical PuppyOne Cloud Git remote.",
        true,
        error,
      );
    }
  }

  async function pushExpectedCommit(rootPath, record, secret) {
    assertCredentialRecordComplete(record);
    await assertExpectedRepositoryIdentity(rootPath, record, execGitCommand);
    await assertExactCanonicalRemote(rootPath, record.canonical_remote_url, execGitCommand);
    let approval = null;
    try {
      approval = await gitCredentialManager.approve(
        rootPath,
        record.canonical_remote_url,
        record.credential_username,
        secret,
      );
      let remoteHead = await readRemoteMain(rootPath, execGitCommand);
      if (remoteHead && remoteHead !== record.expected_head_commit_id) {
        throw createPublishError(
          "PUSH_FAILED",
          "The Cloud Project main branch already points to a different commit.",
          false,
        );
      }
      if (!remoteHead) {
        try {
          await execGitCommand(rootPath, [
            "push",
            CLOUD_REMOTE_NAME,
            `${record.expected_head_commit_id}:refs/heads/${CLOUD_DESTINATION_BRANCH}`,
          ], { timeout: GIT_NETWORK_TIMEOUT_MS });
          await injectFault("after-push-side-effect", record);
        } catch (error) {
          if (isSimulatedCrash(error)) throw error;
          remoteHead = await readRemoteMain(rootPath, execGitCommand).catch(() => null);
          if (remoteHead !== record.expected_head_commit_id) throw error;
        }
      }
      remoteHead = remoteHead ?? await readRemoteMain(rootPath, execGitCommand);
      if (remoteHead !== record.expected_head_commit_id) {
        throw createPublishError(
          "PUSH_FAILED",
          "The Cloud Project did not confirm the expected initial commit.",
          true,
        );
      }
      await injectFault("after-push-reconciled", record);
      return finalizeUpstreamAndStatus(rootPath, record);
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      await approval?.rollback?.().catch(() => undefined);
      if (error?.publishCode) throw error;
      throw createPublishError("PUSH_FAILED", "Unable to push the initial commit to PuppyOne Cloud.", true, error);
    }
  }

  async function finalizeUpstreamAndStatus(rootPath, record) {
    await assertExpectedRepositoryIdentity(rootPath, record, execGitCommand);
    await assertExactCanonicalRemote(rootPath, record.canonical_remote_url, execGitCommand);
    const remoteHead = await readRemoteMain(rootPath, execGitCommand);
    if (remoteHead !== record.expected_head_commit_id) {
      throw createPublishError("PUSH_FAILED", "The Cloud main branch no longer matches the expected commit.", false);
    }
    await execGitCommand(rootPath, [
      "update-ref",
      `refs/remotes/${CLOUD_REMOTE_NAME}/${CLOUD_DESTINATION_BRANCH}`,
      record.expected_head_commit_id,
    ], { timeout: GIT_MUTATION_TIMEOUT_MS });
    await execGitCommand(rootPath, [
      "branch",
      `--set-upstream-to=${CLOUD_REMOTE_NAME}/${CLOUD_DESTINATION_BRANCH}`,
      record.expected_branch,
    ], { timeout: GIT_MUTATION_TIMEOUT_MS });
    await injectFault("after-upstream-configured", record);
    return getGitStatus(rootPath);
  }

  async function persist(rootPath, record, patch) {
    const next = {
      ...record,
      ...patch,
      updated_at: new Date(now()).toISOString(),
    };
    return journal.write(rootPath, next).then((entry) => entry.record);
  }

  async function cleanupCompletedOperation(rootPath, record) {
    if (record.secret_ref) {
      await secretVault.clear(record.secret_ref).catch((error) => {
        throw createPublishError("JOURNAL_IO_FAILED", "Unable to clear the protected publish credential.", true, error);
      });
    }
    await journal.clear(rootPath);
  }

  async function injectFault(point, record) {
    await faultInjector(point, toPublicState(record, { identityMatches: true }));
  }

  return { getState, startOrResume, abandon };
}

function normalizeReadRequest(request) {
  return {
    rootPath: requireString(request.rootPath, "REPOSITORY_REQUIRED", "Workspace path is required."),
    apiBaseUrl: requireApiBase(request.apiBaseUrl),
    userId: requireString(request.userId, "SESSION_REQUIRED", "Cloud user identity is required."),
  };
}

function normalizeStartRequest(request) {
  const base = normalizeReadRequest(request);
  const organizationId = requireString(
    request.organizationId,
    "ORGANIZATION_REQUIRED",
    "Select a PuppyOne organization before publishing.",
  );
  const projectName = requireString(request.projectName, "IDENTITY_MISMATCH", "Cloud Project name is required.");
  if (projectName.length > 200) {
    throw createPublishError("IDENTITY_MISMATCH", "Cloud Project name is too long.", false);
  }
  const expectedHeadCommitId = requireCommitId(request.expectedHeadCommitId);
  const expectedBranch = requireString(request.expectedBranch, "BRANCH_REQUIRED", "Current Git branch is required.");
  return { ...base, organizationId, projectName, expectedHeadCommitId, expectedBranch };
}

function normalizeAbandonRequest(request) {
  const base = normalizeReadRequest(request);
  const operationId = requireString(request.operationId, "IDENTITY_MISMATCH", "Publish operation id is required.");
  if (!UUID_V4_PATTERN.test(operationId)) {
    throw createPublishError("IDENTITY_MISMATCH", "Publish operation id is invalid.", false);
  }
  return { ...base, operationId: operationId.toLowerCase() };
}

function requireApiBase(value) {
  const normalized = normalizeCloudApiBaseUrl(value);
  if (!normalized) throw createPublishError("SESSION_REQUIRED", "Cloud API origin is invalid.", false);
  return normalized;
}

function requireString(value, code, message) {
  if (typeof value !== "string" || !value.trim()) throw createPublishError(code, message, false);
  return value.trim();
}

function requireCommitId(value) {
  const normalized = requireString(value, "COMMIT_REQUIRED", "A committed Git HEAD is required.").toLowerCase();
  if (!COMMIT_ID_PATTERN.test(normalized)) {
    throw createPublishError("COMMIT_REQUIRED", "A valid committed Git HEAD is required.", false);
  }
  return normalized;
}

async function resolveRepositoryContext(rootPath, {
  resolveRepositoryIdentity = resolveGitRepositoryIdentity,
  fsApi = fs.promises,
} = {}) {
  const identity = await resolveRepositoryIdentity(rootPath);
  if (!identity?.repository || !identity.gitDir || !identity.commonDir) {
    throw createPublishError("REPOSITORY_REQUIRED", "Current workspace is not a Git repository.", false);
  }
  const canonicalRoot = path.resolve(rootPath);
  const metadata = await fsApi.stat(identity.commonDir).catch((error) => {
    throw createPublishError("REPOSITORY_REQUIRED", "Unable to inspect the Git repository.", false, error);
  });
  const repositoryFingerprint = crypto.createHash("sha256").update([
    "puppyone-publish-repository-v1",
    String(metadata.dev),
    String(metadata.ino),
    path.resolve(identity.commonDir),
    path.resolve(identity.gitDir),
    path.resolve(identity.topLevel ?? canonicalRoot),
  ].join("\0")).digest("hex");
  return { rootPath: canonicalRoot, identity, repositoryFingerprint };
}

async function refreshRepositoryContext(rootPath, initial, options = {}) {
  const current = await resolveRepositoryContext(rootPath, options);
  if (
    current.identity.gitDir !== initial.identity.gitDir
    || current.identity.commonDir !== initial.identity.commonDir
    || current.repositoryFingerprint !== initial.repositoryFingerprint
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "Git repository identity changed during publish.", false);
  }
  return current;
}

function createInitialRecord(base, context, session, now, randomUUID) {
  const operationId = randomUUID().toLowerCase();
  if (!UUID_V4_PATTERN.test(operationId)) {
    throw createPublishError("JOURNAL_IO_FAILED", "Unable to allocate a publish operation id.", false);
  }
  const timestamp = new Date(now()).toISOString();
  return {
    version: 1,
    kind: "puppyone-cloud-publish",
    operation_id: operationId,
    phase: "prepared",
    api_base_url: base.apiBaseUrl,
    api_origin: new URL(base.apiBaseUrl).origin,
    user_id: session.user_id,
    organization_id: base.organizationId,
    project_name: base.projectName,
    create_payload: {
      org_id: base.organizationId,
      name: base.projectName,
      description: null,
      seed: false,
    },
    repository_fingerprint: context.repositoryFingerprint,
    expected_head_commit_id: base.expectedHeadCommitId,
    expected_branch: base.expectedBranch,
    destination_branch: CLOUD_DESTINATION_BRANCH,
    project_id: null,
    credential_id: null,
    secret_ref: null,
    secret_stored: false,
    canonical_remote_url: null,
    credential_username: null,
    remote_created_by_operation: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function assertFreshPublishStatus(status, base) {
  if (!status?.isRepo) throw createPublishError("REPOSITORY_REQUIRED", "Current workspace is not a Git repository.", false);
  if (!status.headCommitId) throw createPublishError("COMMIT_REQUIRED", "Create a Git commit before publishing.", false);
  if (!status.branch || ["head", "detached"].includes(status.branch.toLowerCase())) {
    throw createPublishError("BRANCH_REQUIRED", "Check out a local Git branch before publishing.", false);
  }
  if (
    status.headCommitId.toLowerCase() !== base.expectedHeadCommitId
    || status.branch !== base.expectedBranch
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "The local branch or HEAD changed before publishing.", false);
  }
}

function assertExpectedStatus(status, record) {
  if (!statusMatchesRecord(status, record)) {
    throw createPublishError(
      "IDENTITY_MISMATCH",
      "The local branch or HEAD no longer matches the pending Cloud publish operation.",
      false,
    );
  }
}

function statusMatchesRecord(status, record) {
  return Boolean(
    status?.isRepo
    && status.headCommitId?.toLowerCase() === record.expected_head_commit_id
    && status.branch === record.expected_branch,
  );
}

function statusMatchesRequest(base, record) {
  return base.expectedHeadCommitId === record.expected_head_commit_id
    && base.expectedBranch === record.expected_branch;
}

function assertJournalStartIdentity(record, base, context, session) {
  assertJournalReadIdentity(record, base, context);
  if (
    record.user_id !== session.user_id
    || record.organization_id !== base.organizationId
    || record.project_name !== base.projectName
    || record.expected_head_commit_id !== base.expectedHeadCommitId
    || record.expected_branch !== base.expectedBranch
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "Publish request does not match the pending operation.", false);
  }
}

function assertJournalReadIdentity(record, base, context) {
  if (
    record.api_base_url !== base.apiBaseUrl
    || record.user_id !== base.userId
    || record.repository_fingerprint !== context.repositoryFingerprint
  ) {
    throw createPublishError("IDENTITY_MISMATCH", "Publish operation identity does not match this session or repository.", false);
  }
}

function validateCreatedProject(value, record) {
  const projectId = typeof value?.id === "string" ? value.id.trim() : "";
  if (!projectId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(projectId)) {
    throw createPublishError("PROJECT_CREATE_FAILED", "Cloud returned an invalid Project identity.", false);
  }
  if (value.org_id !== undefined && value.org_id !== record.organization_id) {
    throw createPublishError("PROJECT_CREATE_FAILED", "Cloud returned a Project in a different organization.", false);
  }
  if (value.name !== undefined && value.name !== record.project_name) {
    throw createPublishError("PROJECT_CREATE_FAILED", "Cloud returned a different Project name.", false);
  }
  return projectId;
}

function validateIssuedCredential(value, record, expectedSecret, { configuredGitOrigin, validateRemoteUrl }) {
  const id = typeof value?.id === "string" ? value.id.trim() : "";
  const remoteUrl = typeof value?.remote?.url === "string" ? value.remote.url.trim() : "";
  const username = typeof value?.remote?.username === "string" && value.remote.username.trim()
    ? value.remote.username.trim()
    : CLOUD_GIT_USERNAME;
  const target = value?.remote?.target;
  if (
    !id
    || value?.credential !== expectedSecret
    || value?.mode !== "rw"
    || target?.kind !== "project_root"
    || target?.project_id !== record.project_id
  ) {
    throw createPublishError("CREDENTIAL_FAILED", "Cloud returned an invalid Git credential response.", false);
  }
  return {
    id,
    username,
    remoteUrl: validateRemoteUrl(remoteUrl, {
      projectId: record.project_id,
      apiBaseUrl: record.api_base_url,
      configuredGitOrigin,
    }),
  };
}

export function validateCanonicalCloudGitRemoteUrl(remoteUrl, {
  projectId,
  apiBaseUrl,
  configuredGitOrigin = null,
} = {}) {
  let remote;
  let api;
  try {
    remote = new URL(remoteUrl);
    api = new URL(apiBaseUrl);
  } catch {
    throw createPublishError("CREDENTIAL_FAILED", "Cloud returned an invalid Git remote URL.", false);
  }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(remote.hostname);
  if (
    (remote.protocol !== "https:" && !(remote.protocol === "http:" && loopback))
    || remote.username
    || remote.password
    || remote.search
    || remote.hash
    || remote.pathname !== `/git/${projectId}.git`
  ) {
    throw createPublishError("CREDENTIAL_FAILED", "Cloud returned an unsafe Git remote URL.", false);
  }
  const allowedOrigins = new Set([api.origin.toLowerCase()]);
  if (configuredGitOrigin) {
    try {
      allowedOrigins.add(new URL(configuredGitOrigin).origin.toLowerCase());
    } catch {
      // Invalid deployment configuration does not widen the trust boundary.
    }
  }
  const apiIsPuppyone = api.hostname === "puppyone.ai" || api.hostname.endsWith(".puppyone.ai");
  const remoteIsPuppyone = remote.hostname === "puppyone.ai" || remote.hostname.endsWith(".puppyone.ai");
  if (!allowedOrigins.has(remote.origin.toLowerCase()) && !(apiIsPuppyone && remoteIsPuppyone)) {
    throw createPublishError("CREDENTIAL_FAILED", "Cloud returned a Git remote outside the trusted Cloud origin.", false);
  }
  return remote.toString();
}

async function assertNoCloudRemote(rootPath, execGitCommand = execGit) {
  const names = await readRemoteNames(rootPath, execGitCommand);
  if (names.some((name) => name.toLowerCase() === CLOUD_REMOTE_NAME)) {
    throw createPublishError(
      "REMOTE_CONFLICT",
      "A Git remote named 'puppyone' already exists. Rename or remove it before publishing.",
      false,
    );
  }
}

async function assertResumeRemoteState(rootPath, record, execGitCommand = execGit) {
  const remote = await inspectCloudRemote(rootPath, execGitCommand);
  if (remote.kind === "missing") return;
  if (
    record.canonical_remote_url
    && remote.kind === "exact"
    && remote.url === record.canonical_remote_url
  ) return;
  throw createPublishError(
    "REMOTE_CONFLICT",
    "The pending publish operation found a conflicting 'puppyone' Git remote.",
    false,
  );
}

async function inspectCloudRemote(rootPath, execGitCommand = execGit) {
  const names = await readRemoteNames(rootPath, execGitCommand);
  const collisions = names.filter((name) => name.toLowerCase() === CLOUD_REMOTE_NAME);
  if (collisions.length === 0) return { kind: "missing", url: null };
  if (collisions.length !== 1 || collisions[0] !== CLOUD_REMOTE_NAME) {
    return { kind: "conflict", url: null };
  }
  const [fetchUrls, pushUrls] = await Promise.all([
    readRemoteUrls(rootPath, execGitCommand, false),
    readRemoteUrls(rootPath, execGitCommand, true),
  ]);
  if (
    fetchUrls.length !== 1
    || pushUrls.length !== 1
    || fetchUrls[0] !== pushUrls[0]
  ) return { kind: "conflict", url: null };
  return { kind: "exact", url: fetchUrls[0] };
}

async function assertExactCanonicalRemote(rootPath, canonicalUrl, execGitCommand = execGit) {
  const remote = await inspectCloudRemote(rootPath, execGitCommand);
  if (remote.kind !== "exact" || remote.url !== canonicalUrl) {
    throw createPublishError("REMOTE_CONFLICT", "Canonical PuppyOne Git remote changed during publish.", false);
  }
}

async function readRemoteNames(rootPath, execGitCommand) {
  return execGitCommand(rootPath, ["remote"], { optionalLocks: false })
    .then(({ stdout }) => stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
}

async function readRemoteUrls(rootPath, execGitCommand, push) {
  return execGitCommand(rootPath, ["remote", "get-url", ...(push ? ["--push"] : []), "--all", CLOUD_REMOTE_NAME], {
    optionalLocks: false,
  }).then(({ stdout }) => stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean));
}

async function assertExpectedRepositoryIdentity(rootPath, record, execGitCommand = execGit) {
  const [branch, head] = await Promise.all([
    execGitCommand(rootPath, ["symbolic-ref", "--quiet", "--short", "HEAD"], { optionalLocks: false })
      .then(({ stdout }) => stdout.trim()).catch(() => ""),
    execGitCommand(rootPath, ["rev-parse", "--verify", "HEAD^{commit}"], { optionalLocks: false })
      .then(({ stdout }) => stdout.trim().toLowerCase()).catch(() => ""),
  ]);
  if (branch !== record.expected_branch || head !== record.expected_head_commit_id) {
    throw createPublishError("IDENTITY_MISMATCH", "The local branch or HEAD changed during publish.", false);
  }
}

export async function assertVersionEnginePreflight(rootPath, expectedCommitId, {
  execGitCommand = execGit,
  execGitBufferCommand = execGitBuffer,
} = {}) {
  const parentLine = await execGitCommand(rootPath, ["rev-list", "--parents", "-n", "1", expectedCommitId], {
    optionalLocks: false,
  }).then(({ stdout }) => stdout.trim()).catch((error) => {
    throw createPublishError("COMMIT_REQUIRED", "Unable to inspect the expected Git commit.", false, error);
  });
  const fields = parentLine.split(/\s+/).filter(Boolean);
  if (fields.length > 2) {
    throw createPublishError(
      "MERGE_TIP_UNSUPPORTED",
      "The current merge commit cannot be the initial PuppyOne Cloud tip. Publish a linearized tip.",
      false,
    );
  }

  let matches;
  try {
    const result = await execGitBufferCommand(rootPath, [
      "grep",
      "-z",
      "-l",
      "--full-name",
      "-e",
      `^${LFS_POINTER_PREAMBLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      expectedCommitId,
      "--",
    ], { maxBuffer: 8 * 1024 * 1024, optionalLocks: false });
    matches = result.stdout;
  } catch (error) {
    if (Number(error?.code) === 1) return;
    throw createPublishError("LFS_UNSUPPORTED", "Unable to complete the Git LFS preflight.", false, error);
  }
  const prefix = Buffer.from(`${expectedCommitId}:`);
  for (const entry of splitNulBuffer(matches)) {
    const pathBytes = entry.subarray(0, prefix.length).equals(prefix) ? entry.subarray(prefix.length) : entry;
    const gitPath = pathBytes.toString("utf8");
    const objectSpec = `${expectedCommitId}:${gitPath}`;
    const size = await execGitCommand(rootPath, ["cat-file", "-s", objectSpec], { optionalLocks: false })
      .then(({ stdout }) => Number.parseInt(stdout.trim(), 10))
      .catch(() => Number.NaN);
    if (!Number.isFinite(size) || size > LFS_POINTER_MAX_BYTES) continue;
    const body = await execGitBufferCommand(rootPath, ["cat-file", "blob", objectSpec], {
      maxBuffer: LFS_POINTER_MAX_BYTES + 1,
      optionalLocks: false,
    }).then(({ stdout }) => stdout.toString("utf8")).catch(() => "");
    if (
      body.startsWith(`${LFS_POINTER_PREAMBLE}\n`)
      && /\noid sha256:[0-9a-f]{64}\n/i.test(`\n${body}`)
      && /\nsize \d+(?:\n|$)/.test(`\n${body}`)
    ) {
      throw createPublishError(
        "LFS_UNSUPPORTED",
        "Git LFS pointer files are not supported by the PuppyOne Cloud repository engine.",
        false,
      );
    }
  }
}

function splitNulBuffer(buffer) {
  const result = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start) result.push(buffer.subarray(start, index));
    start = index + 1;
  }
  if (start < buffer.length) result.push(buffer.subarray(start));
  return result;
}

async function readRemoteMain(rootPath, execGitCommand = execGit) {
  const { stdout } = await execGitCommand(rootPath, [
    "ls-remote",
    "--refs",
    CLOUD_REMOTE_NAME,
    `refs/heads/${CLOUD_DESTINATION_BRANCH}`,
  ], { timeout: GIT_NETWORK_TIMEOUT_MS });
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length !== 1) throw createPublishError("PUSH_FAILED", "Cloud main ref response is ambiguous.", false);
  const [commitId, ref] = lines[0].split(/\s+/);
  if (!COMMIT_ID_PATTERN.test(commitId) || ref !== `refs/heads/${CLOUD_DESTINATION_BRANCH}`) {
    throw createPublishError("PUSH_FAILED", "Cloud main ref response is invalid.", false);
  }
  return commitId.toLowerCase();
}

function assertCredentialRecordComplete(record) {
  if (
    !record.project_id
    || !record.credential_id
    || !record.canonical_remote_url
    || !record.credential_username
  ) {
    throw createPublishError("CREDENTIAL_FAILED", "Pending credential state is incomplete.", false);
  }
}

function requestFingerprint(request) {
  return JSON.stringify([
    request.apiBaseUrl,
    request.userId,
    request.organizationId,
    request.projectName,
    request.expectedHeadCommitId,
    request.expectedBranch,
  ]);
}

function toPublicState(record, { identityMatches }) {
  const resumablePhase = !["compensation-pending", "completed"].includes(record.phase);
  return {
    operationId: record.operation_id,
    phase: record.phase,
    projectId: record.project_id,
    projectName: record.project_name,
    organizationId: record.organization_id,
    expectedHeadCommitId: record.expected_head_commit_id,
    expectedBranch: record.expected_branch,
    destinationBranch: CLOUD_DESTINATION_BRANCH,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    canResume: resumablePhase && identityMatches,
    canAbandon: !["pushed", "completed"].includes(record.phase),
  };
}

function successResult(state, gitStatus = undefined) {
  return {
    ok: true,
    state,
    ...(gitStatus === undefined ? {} : { gitStatus }),
  };
}

function failureResult(error, state) {
  const normalized = normalizePublishError(error);
  return {
    ok: false,
    state,
    error: {
      code: normalized.code,
      retryable: normalized.retryable,
      ...(normalized.message ? { message: normalized.message } : {}),
    },
  };
}

function createPublishError(code, message, retryable, cause = undefined) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.publishCode = CLOUD_PUBLISH_ERROR_CODES.includes(code) ? code : "UNKNOWN";
  error.publishRetryable = retryable === true;
  return error;
}

function mapCloudMutationError(defaultCode, message, error) {
  if (["SESSION_SIGNED_OUT", "SESSION_SIGNING_OUT", "SESSION_CHANGED"].includes(error?.code)) {
    return createPublishError("SESSION_REQUIRED", "Sign in to PuppyOne Cloud and resume publishing.", true, error);
  }
  if (Number(error?.status) === 401) {
    return createPublishError("SESSION_REQUIRED", "Sign in to PuppyOne Cloud and resume publishing.", true, error);
  }
  if (Number(error?.status) === 403) {
    return createPublishError("PERMISSION_DENIED", "You do not have permission to publish this Project.", false, error);
  }
  if (error?.code === "organization_required") {
    return createPublishError("ORGANIZATION_REQUIRED", "Select a PuppyOne organization before publishing.", false, error);
  }
  const retryable = ![400, 403, 404, 409, 410, 422].includes(Number(error?.status));
  return createPublishError(defaultCode, message, retryable, error);
}

function normalizePublishError(error) {
  const code = CLOUD_PUBLISH_ERROR_CODES.includes(error?.publishCode)
    ? error.publishCode
    : error?.code === "CLOUD_PUBLISH_SECRET_VAULT_FAILED"
      ? "JOURNAL_IO_FAILED"
      : "UNKNOWN";
  const retryable = typeof error?.publishRetryable === "boolean"
    ? error.publishRetryable
    : code === "UNKNOWN";
  return {
    code,
    retryable,
    message: sanitizeDiagnostic(error instanceof Error ? error.message : String(error ?? "")),
  };
}

function sanitizeDiagnostic(message) {
  return String(message || "")
    .replace(/pwg_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@")
    .slice(0, 500);
}

function isSimulatedCrash(error) {
  return error?.simulateCrash === true;
}

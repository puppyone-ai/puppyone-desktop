import crypto from "node:crypto";
import fs from "node:fs";
import { getWorkspaceGitStatus, resolveGitRepositoryIdentity } from "../../local-api/workspace.mjs";
import { execGit, execGitBuffer } from "../../local-api/git/runner.mjs";
import { normalizeCloudApiBaseUrl } from "../../shared/cloudEndpoint.js";
import { createCloudPublishApi } from "./cloud-publish-api.mjs";
import { createCloudGitConnectJournal } from "./cloud-git-connect-journal.mjs";
import {
  assertExpectedStatus,
  assertFreshPublishStatus,
  assertJournalReadIdentity,
  assertJournalStartIdentity,
  createInitialRecord,
  createPublishError,
  failureResult,
  isSimulatedCrash,
  normalizeAbandonRequest,
  normalizeReadRequest,
  normalizeStartRequest,
  refreshRepositoryContext,
  requestFingerprint,
  resolveRepositoryContext,
  statusMatchesRecord,
  statusMatchesRequest,
  successResult,
  toPublicState,
} from "./cloud-publish-contract.mjs";
import { createCloudPublishGitCredentialManager } from "./cloud-publish-git-credentials.mjs";
import { createCloudPublishGitService } from "./cloud-publish-git.mjs";
import { createCloudPublishProgressChannel } from "./cloud-publish-progress.mjs";
import { createCloudGitOperationLease } from "./cloud-git-operation-lease.mjs";
import { createCloudPublishJournal } from "./cloud-publish-journal.mjs";
import { createGitOperationCoordinator, repositoryLockKey } from "./git-operation-coordinator.mjs";

export { CLOUD_PUBLISH_ERROR_CODES } from "./cloud-publish-contract.mjs";
export { validateCanonicalCloudGitRemoteUrl } from "./cloud-publish-api.mjs";
export { assertVersionEnginePreflight } from "./cloud-publish-git.mjs";

/** Main-owned durable publish saga. Renderer receives state, never credentials. */
export function createCloudPublishCoordinator({
  cloudAuthService,
  secretVault,
  journal = null,
  connectJournal = null,
  operationLease = null,
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
  validateRemoteUrl,
  configuredGitOrigin = process.env.VITE_DESKTOP_CLOUD_GIT_ORIGIN ?? null,
} = {}) {
  if (!cloudAuthService?.readSession || !cloudAuthService?.requestSessionApi) {
    throw new TypeError("Cloud publish coordinator requires cloudAuthService.");
  }
  if (!secretVault?.createRef || !secretVault?.put || !secretVault?.get || !secretVault?.clear) {
    throw new TypeError("Cloud publish coordinator requires a main-only SecretVault.");
  }

  const durableJournal = journal ?? createCloudPublishJournal({ fsApi, now, resolveRepositoryIdentity });
  const otherJournal = connectJournal ?? createCloudGitConnectJournal({ fsApi, now, resolveRepositoryIdentity });
  const leaseService = operationLease ?? createCloudGitOperationLease({
    fsApi,
    now,
    resolveRepositoryIdentity,
  });
  const cloudApi = createCloudPublishApi({
    cloudAuthService,
    ...(validateRemoteUrl ? { validateRemoteUrl } : {}),
    configuredGitOrigin,
  });
  const gitService = createCloudPublishGitService({
    execGitCommand,
    execGitBufferCommand,
    getGitStatus,
    gitCredentialManager,
    injectFault,
  });
  const inflight = new Map();
  const contextOptions = { resolveRepositoryIdentity, fsApi };
  const resolveContext = (rootPath) => resolveRepositoryContext(rootPath, contextOptions);
  const refreshContext = (rootPath, initial) => refreshRepositoryContext(rootPath, initial, contextOptions);

  async function withOperationLease(rootPath, operation) {
    const lease = await leaseService.acquire(rootPath);
    try {
      return await operation();
    } finally {
      await lease.release();
    }
  }

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
      return await withOperationLease(base.rootPath, () => readStateUnderLock(base, context));
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      return failureResult(error, null);
    }
  }

  async function startOrResume(request = {}, { onProgress = null } = {}) {
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
      if (active.fingerprint === fingerprint) {
        active.progress.add(onProgress);
        return active.promise;
      }
      return failureResult(createPublishError(
        "IDENTITY_MISMATCH",
        "A different Cloud publish operation is already running for this worktree.",
        false,
      ), null);
    }
    const progress = createCloudPublishProgressChannel({ rootPath: base.rootPath, now, onProgress });
    const operation = { fingerprint, progress, promise: null };
    progress.report("validating");
    const promise = gitOperationCoordinator.run(
      repositoryLockKey(context.identity.commonDir),
      () => withOperationLease(base.rootPath, () => runPublishUnderLock(base, context, progress.report)),
    ).catch((error) => {
      if (isSimulatedCrash(error)) throw error;
      return failureResult(error, null);
    }).finally(() => {
      if (inflight.get(key)?.promise === promise) inflight.delete(key);
    });
    operation.promise = promise;
    inflight.set(key, operation);
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
    if (inflight.has(context.identity.gitDir)) {
      return failureResult(createPublishError(
        "COMPENSATION_FAILED",
        "Wait for the current publish attempt to finish before abandoning it.",
        true,
      ), null);
    }
    return gitOperationCoordinator.run(
      repositoryLockKey(context.identity.commonDir),
      () => withOperationLease(base.rootPath, () => runAbandonUnderLock(base, context)),
    ).catch((error) => {
      if (isSimulatedCrash(error)) throw error;
      return failureResult(error, null);
    });
  }

  async function readStateUnderLock(base, initialContext) {
    const loaded = await durableJournal.read(base.rootPath);
    if (!loaded.record) return successResult(null);
    const record = loaded.record;
    try {
      assertJournalRemoteTrust(record);
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
      return identityMatches
        ? successResult(state)
        : failureResult(createPublishError(
          "IDENTITY_MISMATCH",
          "The local branch or HEAD no longer matches the pending Cloud publish operation.",
          false,
        ), state);
    } catch (error) {
      return failureResult(error, toPublicState(record, { identityMatches: false }));
    }
  }

  async function runPublishUnderLock(base, initialContext, reportProgress) {
    let record = null;
    try {
      const context = await refreshContext(base.rootPath, initialContext);
      const session = await assertActiveSession(base);
      if ((await otherJournal.read(base.rootPath)).record) {
        throw createPublishError("IDENTITY_MISMATCH", "A Cloud Git connection operation is already pending.", false);
      }
      record = (await durableJournal.read(base.rootPath)).record;
      reportProgress("validating", record);
      if (!record) {
        const status = await getGitStatus(base.rootPath);
        assertFreshPublishStatus(status, base);
        await gitService.assertNoRemote(base.rootPath);
        await gitService.preflight(base.rootPath, base.expectedHeadCommitId);
        record = createInitialRecord(base, context, session, now, randomUUID);
        await durableJournal.write(base.rootPath, record, { createOnly: true });
        await injectFault("after-prepared", record);
      } else {
        assertJournalRemoteTrust(record);
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
          reportProgress("completed", record);
          await cleanupCompletedOperation(base.rootPath, record);
          return successResult(completed, status);
        }
        assertExpectedStatus(await getGitStatus(base.rootPath), record);
        await gitService.preflight(base.rootPath, record.expected_head_commit_id);
        await gitService.assertResumeRemote(base.rootPath, record);
      }

      if (record.phase === "prepared") {
        reportProgress("creating-project", record);
        const projectId = await cloudApi.createProject(record);
        await injectFault("after-project-response", record);
        record = await persist(base.rootPath, record, { phase: "project-created", project_id: projectId });
        await injectFault("after-project-created", record);
      }
      if (record.phase === "project-created") {
        reportProgress("securing-credential", record);
        const secret = await ensureCredentialSecret(base.rootPath, record);
        record = secret.record;
        const credential = await cloudApi.issueCredential(record, secret.value);
        await injectFault("after-credential-response", record);
        record = await persist(base.rootPath, record, {
          phase: "credential-issued",
          credential_id: credential.id,
          canonical_remote_url: credential.remoteUrl,
          credential_username: credential.username,
        });
        await injectFault("after-credential-issued", record);
      }
      if (record.phase === "credential-issued") {
        reportProgress("configuring-remote", record);
        if (!record.credential_config_snapshot) {
          const credentialConfig = await gitService.prepareCredentialConfig(base.rootPath, record);
          record = await persist(base.rootPath, record, {
            credential_config_snapshot: credentialConfig,
          });
          await injectFault("after-credential-config-journaled", record);
        }
        if (!record.remote_add_intent) {
          await gitService.assertCanonicalRemoteAddIntent(base.rootPath, record);
          record = await persist(base.rootPath, record, { remote_add_intent: true });
          await injectFault("after-remote-add-intent", record);
        }
        const remoteCreated = await gitService.configureCanonicalRemote(
          base.rootPath,
          record,
          await requireStoredSecret(record),
        );
        record = await persist(base.rootPath, record, {
          phase: "remote-configured",
          remote_created_by_operation: record.remote_add_intent || remoteCreated,
        });
        await injectFault("after-remote-configured", record);
      }

      let status;
      if (record.phase === "remote-configured") {
        status = await gitService.pushExpectedCommit(
          base.rootPath,
          record,
          await requireStoredSecret(record),
          (stage) => reportProgress(stage, record),
        );
        record = await persist(base.rootPath, record, { phase: "pushed" });
        await injectFault("after-pushed", record);
      }
      if (record.phase === "pushed") {
        reportProgress("finalizing", record);
        status = status ?? await gitService.finalizeUpstreamAndStatus(base.rootPath, record);
        record = await persist(base.rootPath, record, { phase: "completed" });
        await injectFault("after-completed", record);
      }
      reportProgress("completed", record);
      const completedState = toPublicState(record, { identityMatches: true });
      await cleanupCompletedOperation(base.rootPath, record);
      return successResult(completedState, status ?? await getGitStatus(base.rootPath));
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      const latest = await durableJournal.read(base.rootPath).then((entry) => entry.record).catch(() => record);
      return failureResult(error, latest ? toPublicState(latest, {
        identityMatches: statusMatchesRequest(base, latest),
      }) : null);
    }
  }

  async function runAbandonUnderLock(base, initialContext) {
    let record = null;
    try {
      const context = await refreshContext(base.rootPath, initialContext);
      record = (await durableJournal.read(base.rootPath)).record;
      if (!record) return successResult(null, await getGitStatus(base.rootPath));
      assertJournalRemoteTrust(record);
      await assertActiveSession(base, record);
      assertJournalReadIdentity(record, base, context);
      if (record.operation_id !== base.operationId) {
        throw createPublishError("IDENTITY_MISMATCH", "Publish operation id does not match.", false);
      }
      if (["pushed", "completed"].includes(record.phase)) {
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

      // Server goes first: it atomically proves the Project is still empty.
      // Only its success/replay authorizes removal of the local exact remote.
      if (record.project_id) {
        try {
          await cloudApi.abandonEmptyProject(record);
        } catch (error) {
          if (isNotAbandonable(error)) {
            const status = await gitService.finalizeUpstreamAndStatus(base.rootPath, record).catch(() => null);
            if (status) record = await persist(base.rootPath, record, { phase: "pushed" });
          }
          throw error;
        }
        await injectFault("after-abandon-response", record);
      }
      await gitService.cleanupAfterServerAbandon(base.rootPath, record);
      if (record.secret_ref) await secretVault.clear(record.secret_ref);
      await clearJournal(base.rootPath, record);
      return successResult(null, await getGitStatus(base.rootPath));
    } catch (error) {
      if (isSimulatedCrash(error)) throw error;
      const latest = await durableJournal.read(base.rootPath).then((entry) => entry.record).catch(() => record);
      return failureResult(error, latest ? toPublicState(latest, { identityMatches: false }) : null);
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
          "The protected credential is unavailable. Abandon the operation.",
          false,
        );
      }
      secret = `pwg_${randomBytes(32).toString("base64url")}`;
      await secretVault.put(record.secret_ref, secret).catch((error) => {
        throw createPublishError("CREDENTIAL_FAILED", "Unable to protect the Git credential.", false, error);
      });
      await injectFault("after-secret-vault-write", record);
    }
    if (!record.secret_stored) record = await persist(rootPath, record, { secret_stored: true });
    return { record, value: secret };
  }

  async function requireStoredSecret(record) {
    if (!record.secret_ref || !record.secret_stored) {
      throw createPublishError("CREDENTIAL_FAILED", "Pending Git credential state is incomplete.", false);
    }
    const secret = await secretVault.get(record.secret_ref).catch((error) => {
      throw createPublishError("CREDENTIAL_FAILED", "Unable to read the protected Git credential.", false, error);
    });
    if (!secret) throw createPublishError("CREDENTIAL_FAILED", "Protected Git credential is unavailable.", false);
    return secret;
  }

  function assertJournalRemoteTrust(record) {
    if (record.canonical_remote_url) {
      cloudApi.validateExistingRemote(record.canonical_remote_url, record);
    }
  }

  async function persist(rootPath, record, patch) {
    const next = {
      ...record,
      ...patch,
      revision: record.revision + 1,
      updated_at: new Date(now()).toISOString(),
    };
    return durableJournal.write(rootPath, next, {
      expectedOperationId: record.operation_id,
      expectedRevision: record.revision,
      expectedPhase: record.phase,
    }).then((entry) => entry.record);
  }

  async function cleanupCompletedOperation(rootPath, record) {
    if (record.secret_ref) {
      await secretVault.clear(record.secret_ref).catch((error) => {
        throw createPublishError("JOURNAL_IO_FAILED", "Unable to clear the protected credential.", true, error);
      });
    }
    await clearJournal(rootPath, record);
  }

  function clearJournal(rootPath, record) {
    return durableJournal.clear(rootPath, {
      expectedOperationId: record.operation_id,
      expectedRevision: record.revision,
      expectedPhase: record.phase,
    });
  }

  async function injectFault(point, record) {
    await faultInjector(point, toPublicState(record, { identityMatches: true }));
  }

  return { getState, startOrResume, abandon };
}

function isNotAbandonable(error) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (
      current.code === "initialization_not_abandonable"
      && Number(current.status) === 409
    ) return true;
    current = current.cause;
  }
  return false;
}

import {
  CLOUD_GIT_USERNAME,
  createPublishError,
  mapCloudMutationError,
} from "./cloud-publish-contract.mjs";
import {
  REPOSITORY_TARGET_CONTRACT_HEADER,
  REPOSITORY_TARGET_CONTRACT_VERSION,
} from "../../shared/repositoryContract.js";

export function createCloudPublishApi({
  cloudAuthService,
  validateRemoteUrl = validateCanonicalCloudGitRemoteUrl,
  configuredGitOrigin = process.env.VITE_DESKTOP_CLOUD_GIT_ORIGIN ?? null,
} = {}) {
  if (!cloudAuthService?.readSession || !cloudAuthService?.requestSessionApi) {
    throw new TypeError("Cloud publish API requires cloudAuthService.");
  }

  async function createProject(record) {
    let value;
    try {
      value = await requestIdempotent(record, "/projects/", {
        method: "POST",
        headers: { "Idempotency-Key": record.operation_id },
        body: JSON.stringify(record.create_payload),
      });
    } catch (error) {
      throw mapCloudMutationError("PROJECT_CREATE_FAILED", "Unable to create the Cloud Project.", error);
    }
    return validateCreatedProject(value, record);
  }

  async function issueCredential(record, secret) {
    let value;
    try {
      value = await requestIdempotent(
        record,
        `/projects/${encodeURIComponent(record.project_id)}/git-credentials`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": record.operation_id,
            [REPOSITORY_TARGET_CONTRACT_HEADER]: REPOSITORY_TARGET_CONTRACT_VERSION,
          },
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
    return validateIssuedCredential(value, record, secret, {
      configuredGitOrigin,
      validateRemoteUrl,
    });
  }

  async function abandonEmptyProject(record) {
    try {
      return await requestIdempotent(
        record,
        `/projects/${encodeURIComponent(record.project_id)}/initialization/abandon`,
        {
          method: "POST",
          headers: { "Idempotency-Key": record.operation_id },
          body: "{}",
        },
      );
    } catch (error) {
      throw mapCloudMutationError(
        "COMPENSATION_FAILED",
        "Unable to abandon the empty Cloud Project. Retry Abandon.",
        error,
      );
    }
  }

  async function revokeCredential(record) {
    if (!record.project_id || !record.credential_id) return;
    try {
      await cloudAuthService.requestSessionApi(
        record.api_base_url,
        `/projects/${encodeURIComponent(record.project_id)}/git-credentials/${encodeURIComponent(record.credential_id)}`,
        {
          method: "DELETE",
          headers: {
            "Idempotency-Key": record.operation_id,
            [REPOSITORY_TARGET_CONTRACT_HEADER]: REPOSITORY_TARGET_CONTRACT_VERSION,
          },
        },
      );
    } catch (error) {
      if (Number(error?.status) === 404) return;
      throw mapCloudMutationError(
        "COMPENSATION_FAILED",
        "Unable to revoke the pending Git credential.",
        error,
      );
    }
  }

  async function verifyProjectAccess(record) {
    let value;
    try {
      value = await cloudAuthService.requestSessionApi(
        record.api_base_url,
        `/projects/${encodeURIComponent(record.project_id)}/repository-context`,
        {
          method: "POST",
          headers: {
            [REPOSITORY_TARGET_CONTRACT_HEADER]: REPOSITORY_TARGET_CONTRACT_VERSION,
          },
          body: JSON.stringify({
            target: { kind: "project_root", project_id: record.project_id },
          }),
        },
      );
    } catch (error) {
      throw mapCloudMutationError(
        "REMOTE_CONFIG_FAILED",
        "Unable to verify access to the existing Cloud Project remote.",
        error,
      );
    }
    if (
      value?.project?.id !== record.project_id
      || value?.target?.kind !== "project_root"
      || value?.target?.project_id !== record.project_id
    ) {
      throw createPublishError(
        "IDENTITY_MISMATCH",
        "Cloud returned a different Project repository context.",
        false,
      );
    }
    return value;
  }

  function validateExistingRemote(remoteUrl, record) {
    try {
      return validateRemoteUrl(remoteUrl, {
        projectId: record.project_id,
        apiBaseUrl: record.api_base_url,
        configuredGitOrigin,
      });
    } catch (error) {
      throw createPublishError(
        "REMOTE_CONFLICT",
        "The existing 'puppyone' remote does not identify the requested Cloud Project.",
        false,
        error,
      );
    }
  }

  async function requestIdempotent(record, apiPath, init) {
    return cloudAuthService.requestSessionApi(record.api_base_url, apiPath, init);
  }

  return {
    abandonEmptyProject,
    createProject,
    issueCredential,
    revokeCredential,
    validateExistingRemote,
    verifyProjectAccess,
  };
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
    || value?.mode !== "rw"
    || target?.kind !== "project_root"
    || target?.project_id !== record.project_id
  ) {
    throw createPublishError("CREDENTIAL_FAILED", "Cloud returned an invalid Git credential response.", false);
  }
  // The backend deliberately never echoes the client-generated secret. Its
  // only source remains the main-process SecretVault value used in the POST.
  void expectedSecret;
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

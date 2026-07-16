import {
  GIT_MUTATION_TIMEOUT_MS,
  execGit,
} from "../../local-api/git/runner.mjs";

/** Keeps raw Git credentials in the main process and out of command arguments. */
export function createCloudPublishGitCredentialManager({
  execGitCommand = execGit,
  platform = process.platform,
} = {}) {
  async function approve(rootPath, remoteUrl, username, secret) {
    const snapshot = await snapshotLocalCredentialConfig(rootPath, execGitCommand);
    let approved = false;
    try {
      await ensureSecureCredentialHelper(rootPath, execGitCommand, platform);
      await execGitCommand(rootPath, ["credential", "approve"], {
        timeout: GIT_MUTATION_TIMEOUT_MS,
        input: credentialInput(remoteUrl, username, secret),
      });
      approved = true;
      return {
        async rollback() {
          if (approved) {
            await reject(rootPath, remoteUrl, username).catch(() => undefined);
          }
          await restoreLocalCredentialConfig(rootPath, execGitCommand, snapshot);
        },
      };
    } catch (error) {
      if (approved) await reject(rootPath, remoteUrl, username).catch(() => undefined);
      await restoreLocalCredentialConfig(rootPath, execGitCommand, snapshot).catch(() => undefined);
      throw error;
    }
  }

  async function reject(rootPath, remoteUrl, username) {
    await execGitCommand(rootPath, ["credential", "reject"], {
      timeout: GIT_MUTATION_TIMEOUT_MS,
      input: credentialInput(remoteUrl, username),
    });
  }

  return { approve, reject };
}

async function snapshotLocalCredentialConfig(rootPath, execGitCommand) {
  const [helpers, useHttpPath] = await Promise.all([
    readConfigValues(rootPath, execGitCommand, ["--local", "--get-all", "credential.helper"]),
    readConfigValues(rootPath, execGitCommand, ["--local", "--get-all", "credential.useHttpPath"]),
  ]);
  return { helpers, useHttpPath };
}

async function restoreLocalCredentialConfig(rootPath, execGitCommand, snapshot) {
  await replaceLocalConfigValues(rootPath, execGitCommand, "credential.helper", snapshot.helpers);
  await replaceLocalConfigValues(rootPath, execGitCommand, "credential.useHttpPath", snapshot.useHttpPath);
}

async function ensureSecureCredentialHelper(rootPath, execGitCommand, platform) {
  const configured = await readConfigValues(rootPath, execGitCommand, ["--get-all", "credential.helper"]);
  const unsafe = configured.some(isUnsafeCredentialHelper);
  const secureConfigured = configured.find((helper) => helper && !isUnsafeCredentialHelper(helper)) ?? null;
  const platformDefault = platform === "darwin"
    ? "osxkeychain"
    : platform === "win32"
      ? "manager"
      : null;
  const helper = secureConfigured ?? platformDefault;
  if (!helper) {
    const error = new Error(
      "No secure Git credential helper is configured. Install Git Credential Manager or libsecret.",
    );
    error.code = "SECURE_GIT_CREDENTIAL_HELPER_REQUIRED";
    throw error;
  }

  await replaceLocalConfigValues(rootPath, execGitCommand, "credential.useHttpPath", ["true"]);
  if (!unsafe && secureConfigured) return;

  // The empty entry resets inherited helpers. Otherwise a global `store` can
  // still receive the credential before a secure helper later in the chain.
  await replaceLocalConfigValues(rootPath, execGitCommand, "credential.helper", ["", helper]);
}

async function readConfigValues(rootPath, execGitCommand, args) {
  return execGitCommand(rootPath, ["config", ...args], { optionalLocks: false })
    .then(({ stdout }) => stdout.split(/\r?\n/).map((entry) => entry.trim()).filter((entry, index, all) => (
      entry.length > 0 || (entry.length === 0 && index < all.length - 1)
    )))
    .catch((error) => {
      if (Number(error?.code) === 1) return [];
      throw error;
    });
}

async function replaceLocalConfigValues(rootPath, execGitCommand, key, values) {
  await execGitCommand(rootPath, ["config", "--local", "--unset-all", key], {
    timeout: GIT_MUTATION_TIMEOUT_MS,
  }).catch((error) => {
    if (Number(error?.code) !== 5 && Number(error?.code) !== 1) throw error;
  });
  for (const value of values) {
    await execGitCommand(rootPath, ["config", "--local", "--add", key, value], {
      timeout: GIT_MUTATION_TIMEOUT_MS,
    });
  }
}

function isUnsafeCredentialHelper(value) {
  return /(^|\s)(store|cache)(\s|$)/i.test(value);
}

function credentialInput(remoteUrl, username, password = null) {
  const url = new URL(remoteUrl);
  const fields = [
    `protocol=${url.protocol.slice(0, -1)}`,
    `host=${url.host}`,
    `path=${url.pathname.replace(/^\//, "")}`,
    `username=${username}`,
  ];
  if (password !== null) fields.push(`password=${password}`);
  return `${fields.join("\n")}\n\n`;
}

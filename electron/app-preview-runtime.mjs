import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { BrowserWindow } from "electron";
import { resolveCanonicalWorkspaceDirectory } from "./main/workspace-authorization.mjs";

const APP_PREVIEW_TYPE = "puppyone.app";
const APP_PREVIEW_EXTENSION = ".puppyoneapp";
const HEALTH_TIMEOUT_MS = 18000;
const HEALTH_POLL_INTERVAL_MS = 300;
const HEALTH_REQUEST_TIMEOUT_MS = 1200;
const LOG_LIMIT = 60000;
const TRUST_STORE_FILENAME = "app-preview-trust.json";
const DEFAULT_DIALOG_MESSAGES = Object.freeze({
  "native.appPreview.run.message": ({ appName }) => `Run ${appName}?`,
  "native.appPreview.run.intro": () => "PuppyOne will start a local app preview for this workspace.",
  "native.appPreview.run.command": ({ command }) => `Command: ${command}`,
  "native.appPreview.run.workingDirectory": ({ directory }) => `Working directory: ${directory}`,
  "native.appPreview.run.permissions": ({ permissions }) => `Permissions: ${permissions}`,
  "native.appPreview.run.confirm": () => "Run App",
  "native.appPreview.run.cancel": () => "Cancel",
});

function defaultTranslate(messageId, values = {}) {
  return DEFAULT_DIALOG_MESSAGES[messageId]?.(values) ?? "";
}

export function createAppPreviewRuntime({
  app,
  dialog,
  shell,
  readWorkspaceTextFile,
  resolveWorkspacePath,
  t = defaultTranslate,
}) {
  const sessions = new Map();
  const trustedManifests = loadTrustedManifests(app);

  async function start(sender, request, options = {}) {
    const context = await loadAppPreviewContext(request);
    const key = getSessionKey(context.rootPath, context.appPath);
    const existing = sessions.get(key);

    if (existing?.status === "running" && existing.child && !existing.child.killed) {
      requireSessionOwner(existing, sender);
      return serializeSession(existing);
    }

    if (existing?.status === "starting" && existing.startPromise) {
      requireSessionOwner(existing, sender);
      return existing.startPromise;
    }

    if (existing) {
      requireSessionOwner(existing, sender);
      await stopSession(existing, "restart");
      sessions.delete(key);
    }

    await ensureTrusted(sender, context, options.forceTrust === true);

    const session = createSession(context, sender);
    sessions.set(key, session);
    session.startPromise = startSession(session)
      .then(() => serializeSession(session))
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        session.status = "error";
        session.message = message;
        appendLog(session, `[puppyone] ${session.message}\n`);
        await terminateSessionChild(session, "start failed");
        throw error;
      })
      .finally(() => {
        session.startPromise = null;
      });

    return session.startPromise;
  }

  async function restart(sender, request) {
    const context = await loadAppPreviewContext(request);
    const key = getSessionKey(context.rootPath, context.appPath);
    const existing = sessions.get(key);
    if (existing) {
      requireSessionOwner(existing, sender);
      await stopSession(existing, "restart");
      sessions.delete(key);
    }
    return start(sender, request);
  }

  async function stop(sender, request) {
    const context = await loadAppPreviewContext(request);
    const key = getSessionKey(context.rootPath, context.appPath);
    const existing = sessions.get(key);
    if (!existing) {
      return {
        appId: context.appId,
        name: context.manifest.name,
        status: "stopped",
        path: context.appPath,
        url: null,
        port: null,
        command: context.manifest.launch.command,
        cwd: context.cwdPath,
        message: null,
        logs: "",
      };
    }
    requireSessionOwner(existing, sender);
    await stopSession(existing, "stop");
    return serializeSession(existing);
  }

  async function getLogs(sender, request) {
    const context = await loadAppPreviewContext(request);
    const existing = sessions.get(getSessionKey(context.rootPath, context.appPath));
    if (existing) requireSessionOwner(existing, sender);
    return existing?.logs ?? "";
  }

  async function openExternal(sender, request) {
    const result = await start(sender, request);
    if (!result.url) {
      throw new Error("App Preview URL is unavailable.");
    }
    await shell.openExternal(result.url);
  }

  function closeSessionsForWindow(webContentsId) {
    for (const [key, session] of Array.from(sessions.entries())) {
      session.ownerIds.delete(webContentsId);
      if (session.ownerIds.size === 0) {
        void stopSession(session, "window closed").finally(() => {
          sessions.delete(key);
        });
      }
    }
  }

  function closeAll() {
    for (const [key, session] of Array.from(sessions.entries())) {
      void stopSession(session, "quit").finally(() => {
        sessions.delete(key);
      });
    }
  }

  async function loadAppPreviewContext(request) {
    const rootPath = normalizeRootPath(request?.rootPath);
    const appPath = normalizeAppPath(request?.path);
    const content = await readWorkspaceTextFile(rootPath, appPath).then((file) => file.content ?? "");
    const manifest = normalizeManifest(JSON.parse(content), appPath);
    const manifestHash = createHash("sha256").update(content).digest("hex");
    const appDir = getRelativeDir(appPath);
    const cwdRelativePath = joinManifestRelativePath(appDir, manifest.launch.cwd ?? ".");
    const unresolvedCwdPath = resolveWorkspacePath(rootPath, cwdRelativePath);
    const cwdPath = await resolveCanonicalWorkspaceDirectory(rootPath, unresolvedCwdPath, {
      label: "App preview cwd",
    });
    const appId = manifest.id || `${rootPath}:${appPath}`;

    return {
      rootPath,
      appPath,
      appId,
      appDir,
      content,
      manifest,
      manifestHash,
      cwdPath,
      cwdRelativePath,
    };
  }

  async function ensureTrusted(sender, context, forceTrust) {
    const trustKey = `${context.rootPath}:${context.appPath}:${context.manifestHash}`;
    if (forceTrust || trustedManifests.has(trustKey)) {
      rememberTrustedManifest(app, trustedManifests, trustKey);
      return;
    }

    const window = BrowserWindow.fromWebContents(sender);
    const command = formatCommand(context.manifest.launch.command);
    const permissions = formatPermissions(context.manifest.permissions);
    const dialogOptions = {
      type: "question",
      message: t("native.appPreview.run.message", { appName: context.manifest.name }),
      detail: [
        t("native.appPreview.run.intro"),
        "",
        t("native.appPreview.run.command", { command }),
        t("native.appPreview.run.workingDirectory", { directory: context.cwdRelativePath || "." }),
        permissions ? t("native.appPreview.run.permissions", { permissions }) : null,
      ].filter(Boolean).join("\n"),
      buttons: [
        t("native.appPreview.run.confirm"),
        t("native.appPreview.run.cancel"),
      ],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const result = window
      ? await dialog.showMessageBox(window, dialogOptions)
      : await dialog.showMessageBox(dialogOptions);

    if (result.response !== 0) {
      throw new Error("App preview was cancelled.");
    }
    rememberTrustedManifest(app, trustedManifests, trustKey);
  }

  function createSession(context, sender) {
    return {
      ...context,
      key: getSessionKey(context.rootPath, context.appPath),
      ownerIds: new Set([sender.id]),
      child: null,
      port: null,
      url: null,
      logs: "",
      status: "starting",
      message: null,
      startPromise: null,
      ignoreNextExit: false,
    };
  }

  async function startSession(session) {
    session.status = "starting";
    session.message = null;
    session.port = await allocatePort();
    session.url = buildLocalUrl(session.manifest.launch.url, session.port);
    const healthUrl = buildHealthUrl(session.url, session.manifest.launch.health);
    const spawnConfig = buildSpawnConfig(session, session.port);

    appendLog(session, `[puppyone] Starting ${session.manifest.name}\n`);
    appendLog(session, `[puppyone] ${formatCommand(session.manifest.launch.command)}\n`);
    appendLog(session, `[puppyone] ${session.cwdPath}\n`);

    const child = spawn(spawnConfig.file, spawnConfig.args, {
      cwd: session.cwdPath,
      env: spawnConfig.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    session.child = child;

    child.stdout?.on("data", (chunk) => appendLog(session, String(chunk)));
    child.stderr?.on("data", (chunk) => appendLog(session, String(chunk)));
    child.on("error", (error) => {
      session.status = "error";
      session.message = error.message;
      appendLog(session, `[puppyone] Process error: ${error.message}\n`);
    });
    child.on("exit", (code, signal) => {
      if (session.status === "stopped" || session.ignoreNextExit) {
        session.ignoreNextExit = false;
        return;
      }
      const message = `Process exited${code == null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}.`;
      session.status = code === 0 ? "stopped" : "error";
      session.message = message;
      appendLog(session, `[puppyone] ${message}\n`);
    });

    await waitForHealth(session, healthUrl);
    session.status = "running";
    session.message = null;
    appendLog(session, `[puppyone] Ready: ${session.url}\n`);
  }

  async function stopSession(session, reason) {
    session.status = "stopped";
    session.message = reason ? `Stopped: ${reason}` : null;
    if (!session.child || session.child.killed) return;

    await terminateSessionChild(session, reason);
  }

  async function terminateSessionChild(session, reason) {
    if (!session.child || session.child.killed) return;
    const child = session.child;
    session.ignoreNextExit = true;
    appendLog(session, `[puppyone] Stopping app preview (${reason}).\n`);
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // The process may already be gone.
        }
        resolve();
      }, 1200);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
    session.child = null;
  }

  return {
    start,
    restart,
    stop,
    getLogs,
    openExternal,
    closeSessionsForWindow,
    closeAll,
  };
}

function normalizeRootPath(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Workspace root path is required.");
  }
  return path.resolve(value);
}

function normalizeAppPath(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("App path is required.");
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.toLowerCase().endsWith(APP_PREVIEW_EXTENSION)) {
    throw new Error("App Preview files must use the .puppyoneapp extension.");
  }
  return normalized;
}

function normalizeManifest(value, appPath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("App manifest must be a JSON object.");
  }
  if (value.type !== APP_PREVIEW_TYPE) {
    throw new Error(`App manifest type must be "${APP_PREVIEW_TYPE}".`);
  }
  const version = Number(value.version);
  if (version !== 1) {
    throw new Error("Unsupported Puppyone App manifest version.");
  }

  const launch = normalizeLaunch(value.launch);
  return {
    id: normalizeOptionalString(value.id),
    name: normalizeString(value.name, path.basename(appPath, APP_PREVIEW_EXTENSION)),
    type: APP_PREVIEW_TYPE,
    version,
    launch,
    permissions: normalizePermissions(value.permissions),
  };
}

function normalizeLaunch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("App manifest launch config is required.");
  }
  if (value.kind !== "local-server") {
    throw new Error("Only local-server app previews are supported.");
  }
  if (!Array.isArray(value.command) || value.command.length === 0) {
    throw new Error("App preview command must be a non-empty array.");
  }
  const command = value.command.map((part) => normalizeCommandPart(part));
  const cwd = normalizeRelativeManifestPath(value.cwd ?? ".");
  const url = normalizeUrlTemplate(value.url);
  const health = normalizeHealth(value.health);
  const env = normalizeEnv(value.env);

  return {
    kind: "local-server",
    command,
    cwd,
    url,
    health,
    env,
  };
}

function normalizeCommandPart(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new Error("App preview command contains an invalid value.");
  }
  return value.trim();
}

function normalizeRelativeManifestPath(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new Error("App preview cwd must be a relative path.");
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("App preview cwd must stay inside the workspace.");
  }
  return normalized === "." ? "." : normalized.replace(/^\.\/+/, "");
}

function normalizeUrlTemplate(value) {
  if (typeof value !== "string" || !value.includes("${port}")) {
    throw new Error("App preview URL must include ${port}.");
  }
  return value;
}

function normalizeHealth(value) {
  if (value == null) {
    return {
      path: "/",
      expectStatus: 200,
    };
  }
  if (typeof value === "string") {
    return {
      path: normalizeHealthPath(value),
      expectStatus: 200,
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("App preview health config is invalid.");
  }
  return {
    path: normalizeHealthPath(value.path ?? "/"),
    expectStatus: normalizeStatusCode(value.expectStatus ?? 200),
  };
}

function normalizeHealthPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) {
    throw new Error("App preview health path must start with /.");
  }
  return value;
}

function normalizeStatusCode(value) {
  const status = Number(value);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error("App preview expected health status is invalid.");
  }
  return status;
}

function normalizeEnv(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("App preview env must be an object.");
  }
  const env = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new Error(`Invalid app preview env key: ${key}`);
    }
    if (typeof rawValue !== "string") {
      throw new Error(`App preview env value for ${key} must be a string.`);
    }
    env[key] = rawValue;
  }
  return env;
}

function normalizePermissions(value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : null;
}

function getSessionKey(rootPath, appPath) {
  return `${rootPath}\n${appPath}`;
}

function getRelativeDir(relativePath) {
  const dir = path.posix.dirname(relativePath.replace(/\\/g, "/"));
  return dir === "." ? "" : dir;
}

function joinManifestRelativePath(base, relative) {
  const normalized = path.posix.normalize(path.posix.join(base || ".", relative || "."));
  return normalized === "." ? "" : normalized;
}

function buildLocalUrl(template, port) {
  const rawUrl = template.replaceAll("${port}", String(port));
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("App preview URL must use http or https.");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("App preview URL must bind to localhost.");
  }
  return url.toString();
}

function buildHealthUrl(appUrl, health) {
  const url = new URL(health.path, appUrl);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("App preview health URL must be localhost.");
  }
  return {
    url: url.toString(),
    expectStatus: health.expectStatus,
  };
}

function buildSpawnConfig(session, port) {
  const command = session.manifest.launch.command;
  const env = {
    ...process.env,
    ...interpolateEnv(session.manifest.launch.env, port),
    HOST: "127.0.0.1",
    PORT: String(port),
    PUPPYONE_APP_PREVIEW: "1",
    PUPPYONE_WORKSPACE_ROOT: session.rootPath,
  };

  if (command[0] === "node") {
    return {
      file: process.execPath,
      args: command.slice(1),
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    };
  }

  return {
    file: command[0],
    args: command.slice(1),
    env,
  };
}

function interpolateEnv(env, port) {
  const next = {};
  for (const [key, value] of Object.entries(env)) {
    next[key] = value.replaceAll("${port}", String(port));
  }
  return next;
}

async function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate a local preview port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForHealth(session, health) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    if (!session.child || session.child.killed) {
      throw new Error(session.message || "App preview process exited before it became ready.");
    }
    if (session.status === "error") {
      throw new Error(session.message || "App preview failed to start.");
    }

    try {
      const response = await fetchWithTimeout(health.url, HEALTH_REQUEST_TIMEOUT_MS);
      if (response.status === health.expectStatus) return;
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await delay(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(lastError instanceof Error ? `App preview did not become ready. ${lastError.message}` : "App preview did not become ready.");
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireSessionOwner(session, sender) {
  if (!session.ownerIds.has(sender?.id)) {
    throw new Error("App preview session belongs to another window.");
  }
}

function appendLog(session, value) {
  session.logs = `${session.logs}${value}`;
  if (session.logs.length > LOG_LIMIT) {
    session.logs = session.logs.slice(session.logs.length - LOG_LIMIT);
  }
}

function serializeSession(session) {
  return {
    appId: session.appId,
    name: session.manifest.name,
    status: session.status,
    path: session.appPath,
    url: session.url,
    port: session.port,
    command: session.manifest.launch.command,
    cwd: session.cwdPath,
    message: session.message,
    logs: session.logs,
  };
}

function formatCommand(command) {
  return command.map((part) => /\s/.test(part) ? JSON.stringify(part) : part).join(" ");
}

function formatPermissions(permissions) {
  if (!permissions || typeof permissions !== "object") return "";
  const workspace = Array.isArray(permissions.workspace) ? permissions.workspace.join(", ") : null;
  return workspace ? `workspace: ${workspace}` : "";
}

function loadTrustedManifests(app) {
  try {
    const raw = fs.readFileSync(getTrustStorePath(app), "utf8");
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed?.trustedManifests)
      ? parsed.trustedManifests.filter((item) => typeof item === "string")
      : []);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Unable to read app preview trust store:", error);
    }
    return new Set();
  }
}

function rememberTrustedManifest(app, trustedManifests, trustKey) {
  if (trustedManifests.has(trustKey)) return;
  trustedManifests.add(trustKey);
  try {
    const trustStorePath = getTrustStorePath(app);
    fs.mkdirSync(path.dirname(trustStorePath), { recursive: true });
    fs.writeFileSync(
      trustStorePath,
      JSON.stringify({ trustedManifests: Array.from(trustedManifests).slice(-500) }, null, 2),
      "utf8",
    );
  } catch (error) {
    console.warn("Unable to persist app preview trust:", error);
  }
}

function getTrustStorePath(app) {
  return path.join(app.getPath("userData"), TRUST_STORE_FILENAME);
}

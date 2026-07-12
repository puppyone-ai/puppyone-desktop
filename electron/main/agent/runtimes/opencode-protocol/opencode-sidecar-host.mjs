import net from "node:net";
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import { OpenCodeHttpClient } from "./opencode-http-client.mjs";
import { redactSecretText } from "../../agent-events.mjs";

const START_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 5_000;
const HEALTH_POLL_MS = 100;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;

export class OpenCodeSidecarHost {
  constructor({
    spawn = nodeSpawn,
    randomBytes = nodeRandomBytes,
    allocatePort = allocateLoopbackPort,
    clientFactory = (options) => new OpenCodeHttpClient(options),
    logger = console,
    runtimeLabel = "OpenCode",
    startTimeoutMs = START_TIMEOUT_MS,
    stopTimeoutMs = STOP_TIMEOUT_MS,
  } = {}) {
    this.spawn = spawn;
    this.randomBytes = randomBytes;
    this.allocatePort = allocatePort;
    this.clientFactory = clientFactory;
    this.logger = logger;
    this.runtimeLabel = typeof runtimeLabel === "string" && runtimeLabel.trim()
      ? runtimeLabel.trim().slice(0, 120)
      : "OpenCode";
    this.startTimeoutMs = startTimeoutMs;
    this.stopTimeoutMs = stopTimeoutMs;
    this.eventListeners = new Set();
    this.exitListeners = new Set();
    this.reconnectListeners = new Set();
    this.child = null;
    this.client = null;
    this.starting = null;
    this.stopping = null;
    this.eventAbort = null;
    this.diagnostics = "";
    this.identity = null;
    this.expectedExit = false;
    this.stopRequested = false;
    this.spawnError = null;
  }

  async acquire(readiness) {
    if (!readiness?.executablePath || readiness.status !== "ready") {
      throw new Error(readiness?.message || `${this.runtimeLabel} is not ready.`);
    }
    if (this.stopping) await this.stopping;
    const identity = `${readiness.executablePath}\0${readiness.version ?? "unknown"}`;
    if (this.client && this.child && this.identity === identity) return this.client;
    if (this.starting) return this.starting;
    if (this.child && this.identity !== identity) await this.stop();
    this.stopRequested = false;
    this.starting = this.#start(readiness, identity).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError(`${this.runtimeLabel} event listener must be a function.`);
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onExit(listener) {
    if (typeof listener !== "function") throw new TypeError(`${this.runtimeLabel} exit listener must be a function.`);
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  onReconnect(listener) {
    if (typeof listener !== "function") throw new TypeError(`${this.runtimeLabel} reconnect listener must be a function.`);
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  snapshot() {
    return {
      state: this.stopping ? "stopping" : this.client && this.child ? "ready" : this.starting ? "starting" : "idle",
      identity: this.identity,
      diagnostics: this.diagnostics,
    };
  }

  async #start(readiness, identity) {
    const port = await this.allocatePort();
    if (this.stopRequested) throw new Error(`${this.runtimeLabel} startup was cancelled during application shutdown.`);
    const username = "puppyone";
    const password = this.randomBytes(32).toString("base64url");
    const encodedAuthorization = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    const client = this.clientFactory({
      baseUrl: `http://127.0.0.1:${port}`,
      username,
      password,
    });
    const environment = {
      ...(readiness.environment ?? {}),
      OPENCODE_CLIENT: "puppyone-desktop",
      OPENCODE_SERVER_USERNAME: username,
      OPENCODE_SERVER_PASSWORD: password,
    };
    this.expectedExit = false;
    this.spawnError = null;
    this.diagnostics = "";
    const child = this.spawn(readiness.executablePath, [
      "serve",
      "--hostname", "127.0.0.1",
      "--port", String(port),
      "--log-level", "WARN",
    ], {
      cwd: readiness.workspaceRoot || undefined,
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    this.identity = identity;
    const appendDiagnostic = (chunk) => {
      const safeChunk = redactSecretText(String(chunk))
        .split(password).join("[redacted]")
        .split(encodedAuthorization).join("[redacted]");
      const next = `${this.diagnostics}${safeChunk}`;
      this.diagnostics = next.slice(-MAX_DIAGNOSTIC_BYTES);
    };
    child.stdout?.on("data", appendDiagnostic);
    child.stderr?.on("data", appendDiagnostic);
    child.once("error", (error) => {
      this.spawnError = error;
      appendDiagnostic(error);
    });
    child.once("exit", (code, signal) => {
      const expected = this.expectedExit;
      if (this.child === child) {
        this.child = null;
        this.client = null;
        this.identity = null;
        this.eventAbort?.abort();
        this.eventAbort = null;
      }
      for (const listener of this.exitListeners) {
        try {
          listener({ expected, code, signal, diagnostics: this.diagnostics });
        } catch (error) {
          this.logger.warn?.(`${this.runtimeLabel} exit listener failed:`, error);
        }
      }
    });
    try {
      await this.#waitUntilHealthy(client, child);
      if (this.child !== child) throw new Error(`${this.runtimeLabel} exited before becoming ready.`);
      this.client = client;
      this.#startEventStream(client, child);
      return client;
    } catch (error) {
      if (!this.stopRequested) this.expectedExit = true;
      child.kill();
      if (this.child === child) {
        this.child = null;
        this.client = null;
        this.identity = null;
      }
      throw new Error(`${this.runtimeLabel} failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async #waitUntilHealthy(client, child) {
    const deadline = Date.now() + this.startTimeoutMs;
    let lastError = null;
    while (Date.now() < deadline && this.child === child && !this.stopRequested) {
      if (this.spawnError) throw this.spawnError;
      try {
        const health = await client.health({ timeoutMs: 750 });
        if (health && (health.healthy === true || health.status === "ok" || health === true)) return;
      } catch (error) {
        lastError = error;
      }
      await delay(HEALTH_POLL_MS);
    }
    if (this.stopRequested) throw new Error(`${this.runtimeLabel} startup was cancelled.`);
    throw lastError ?? new Error(`${this.runtimeLabel} did not become ready within ${this.startTimeoutMs}ms.`);
  }

  #startEventStream(client, child) {
    this.eventAbort?.abort();
    const controller = new AbortController();
    this.eventAbort = controller;
    let openedOnce = false;
    const run = async () => {
      while (!controller.signal.aborted && this.child === child) {
        try {
          await client.subscribeGlobalEvents({
            signal: controller.signal,
            onOpen: async () => {
              if (openedOnce) await this.#notifyReconnect();
              openedOnce = true;
            },
            onEvent: async (event) => {
              for (const listener of this.eventListeners) {
                try {
                  await listener(event);
                } catch (error) {
                  this.logger.warn?.(`${this.runtimeLabel} event listener failed:`, error);
                }
              }
            },
          });
        } catch (error) {
          if (controller.signal.aborted || this.child !== child) return;
          appendBoundedWarning(this, error);
        }
        if (!controller.signal.aborted && this.child === child) await delay(500);
      }
    };
    void run();
  }

  async #notifyReconnect() {
    await Promise.all(Array.from(this.reconnectListeners, async (listener) => {
      try {
        await listener();
      } catch (error) {
        this.logger.warn?.(`${this.runtimeLabel} reconnect reconciliation failed:`, error);
      }
    }));
  }

  async stop({ expected = true } = {}) {
    if (this.stopping) return this.stopping;
    this.stopRequested = true;
    this.expectedExit = expected;
    this.stopping = (async () => {
      let child = this.child;
      if (!child && this.starting) {
        await this.starting.catch(() => {});
        child = this.child;
      }
      if (!child) return;
      this.eventAbort?.abort();
      this.eventAbort = null;
      const exited = waitForExit(child);
      child.kill("SIGTERM");
      const graceful = await Promise.race([exited.then(() => true), delay(this.stopTimeoutMs).then(() => false)]);
      if (!graceful && this.child === child) {
        child.kill("SIGKILL");
        await Promise.race([exited, delay(1_000)]);
      }
      if (this.child === child) {
        this.child = null;
        this.client = null;
        this.identity = null;
      }
    })().finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }
}

export function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref?.();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("Unable to allocate an OpenCode loopback port."));
        else resolve(port);
      });
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null && child.exitCode !== undefined) {
      resolve();
      return;
    }
    child.once("exit", resolve);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function appendBoundedWarning(host, error) {
  const message = error instanceof Error ? error.message : String(error);
  host.diagnostics = `${host.diagnostics}\nEvent stream: ${message}`.slice(-MAX_DIAGNOSTIC_BYTES);
}

export const openCodeSidecarLimits = Object.freeze({
  startTimeoutMs: START_TIMEOUT_MS,
  stopTimeoutMs: STOP_TIMEOUT_MS,
  maxDiagnosticBytes: MAX_DIAGNOSTIC_BYTES,
});

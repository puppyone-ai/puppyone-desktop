import { EventEmitter } from "node:events";
import { spawn as nodeSpawn } from "node:child_process";
import { redactSecretText } from "./agent-events.mjs";

const DEFAULT_MAX_LINE_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_MAX_PENDING = 128;

export class JsonlRpcConnection extends EventEmitter {
  constructor({
    executablePath,
    args,
    cwd,
    env,
    spawn = nodeSpawn,
    maxLineBytes = DEFAULT_MAX_LINE_BYTES,
    maxStderrBytes = DEFAULT_MAX_STDERR_BYTES,
    maxPending = DEFAULT_MAX_PENDING,
  }) {
    super();
    if (typeof executablePath !== "string" || executablePath.length === 0) {
      throw new TypeError("An absolute Codex executable path is required.");
    }
    this.maxLineBytes = maxLineBytes;
    this.maxStderrBytes = maxStderrBytes;
    this.maxPending = maxPending;
    this.nextRequestId = 1;
    this.pending = new Map();
    this.seenResponseIds = new Set();
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.closed = false;
    this.exitInfo = null;
    this.child = spawn(executablePath, args, {
      cwd,
      env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout?.setEncoding?.("utf8");
    this.child.stderr?.setEncoding?.("utf8");
    this.child.stdout?.on("data", (chunk) => this.#receiveStdout(chunk));
    this.child.stderr?.on("data", (chunk) => this.#receiveStderr(chunk));
    this.child.once("error", (error) => this.#handleExit(null, null, error));
    this.child.once("close", (code, signal) => this.#handleExit(code, signal, null));
  }

  request(method, params, { timeoutMs = 20_000 } = {}) {
    if (this.closed) return Promise.reject(new Error("Codex app-server is not connected."));
    if (this.pending.size >= this.maxPending) {
      return Promise.reject(new Error("Too many pending Codex requests."));
    }
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(String(id), { method, resolve, reject, timer });
      try {
        this.#write({ method, id, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(String(id));
        reject(error);
      }
    });
  }

  notify(method, params) {
    this.#write(params === undefined ? { method } : { method, params });
  }

  respond(id, result) {
    this.#write({ id, result });
  }

  respondError(id, code, message) {
    this.#write({ id, error: { code, message: redactSecretText(message) } });
  }

  getDiagnostics() {
    return redactSecretText(this.stderrBuffer.slice(-this.maxStderrBytes));
  }

  dispose(reason = "Codex app-server connection closed.") {
    if (this.closed) return;
    this.closed = true;
    this.#rejectPending(new Error(reason));
    try {
      this.child.stdin?.end?.();
    } catch {
      // Provider stdin may already be closed.
    }
    try {
      this.child.kill();
    } catch {
      // Provider may already have exited.
    }
  }

  #write(message) {
    if (this.closed || !this.child.stdin?.writable) {
      throw new Error("Codex app-server stdin is unavailable.");
    }
    const line = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(line, "utf8") > this.maxLineBytes) {
      throw new Error("Codex request exceeded the JSONL safety limit.");
    }
    this.child.stdin.write(line, "utf8");
  }

  #receiveStdout(chunk) {
    if (this.closed) return;
    this.stdoutBuffer += String(chunk);
    if (Buffer.byteLength(this.stdoutBuffer, "utf8") > this.maxLineBytes && !this.stdoutBuffer.includes("\n")) {
      this.#protocolFailure("Codex emitted a JSONL line larger than the safety limit.");
      return;
    }
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0 && !this.closed) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (Buffer.byteLength(line, "utf8") > this.maxLineBytes) {
        this.#protocolFailure("Codex emitted a JSONL line larger than the safety limit.");
        return;
      }
      if (line.trim()) this.#receiveLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  #receiveLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.#protocolFailure("Codex emitted malformed JSONL protocol data.");
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      this.#protocolFailure("Codex emitted an invalid JSON-RPC message.");
      return;
    }
    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const hasMethod = typeof message.method === "string" && message.method.length > 0;
    if (hasMethod && hasId) {
      this.emit("request", message);
      return;
    }
    if (hasMethod) {
      this.emit("notification", message);
      return;
    }
    if (hasId) {
      this.#receiveResponse(message);
      return;
    }
    this.#protocolFailure("Codex emitted an unclassifiable JSON-RPC message.");
  }

  #receiveResponse(message) {
    const id = String(message.id);
    if (this.seenResponseIds.has(id)) {
      this.#protocolFailure(`Codex emitted a duplicate response id: ${id}`);
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) {
      this.#protocolFailure(`Codex emitted an unknown response id: ${id}`);
      return;
    }
    this.pending.delete(id);
    clearTimeout(pending.timer);
    this.seenResponseIds.add(id);
    if (this.seenResponseIds.size > 512) {
      this.seenResponseIds.delete(this.seenResponseIds.values().next().value);
    }
    if (message.error) {
      const detail = typeof message.error.message === "string"
        ? redactSecretText(message.error.message)
        : "Unknown JSON-RPC error";
      pending.reject(new Error(`${pending.method}: ${detail}`));
    } else {
      pending.resolve(message.result);
    }
  }

  #receiveStderr(chunk) {
    if (this.closed) return;
    this.stderrBuffer += String(chunk);
    if (Buffer.byteLength(this.stderrBuffer, "utf8") > this.maxStderrBytes) {
      this.stderrBuffer = this.stderrBuffer.slice(-this.maxStderrBytes);
    }
  }

  #protocolFailure(message) {
    const error = new Error(message);
    this.emit("protocolError", error);
    this.dispose(message);
  }

  #handleExit(code, signal, error) {
    if (this.exitInfo) return;
    this.exitInfo = {
      code: Number.isInteger(code) ? code : null,
      signal: signal ? String(signal) : null,
      error: error ? redactSecretText(error.message || String(error)) : null,
      diagnostics: this.getDiagnostics(),
    };
    const wasClosed = this.closed;
    this.closed = true;
    this.#rejectPending(new Error(error?.message || `Codex app-server exited${code === null ? "" : ` with code ${code}`}.`));
    this.emit("exit", { ...this.exitInfo, expected: wasClosed });
  }

  #rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

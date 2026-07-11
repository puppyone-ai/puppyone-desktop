import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_JSON_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_SSE_EVENT_BYTES = 1024 * 1024;

export class OpenCodeHttpClient {
  #baseUrl;
  #authorization;
  #fetch;
  #requestTimeoutMs;
  #sdk;

  constructor({ baseUrl, username, password, fetchImpl = globalThis.fetch, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
    if (typeof fetchImpl !== "function") throw new TypeError("OpenCode requires a fetch implementation.");
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" || !isLoopbackHostname(url.hostname)) {
      throw new Error("OpenCode sidecar connections must use loopback HTTP.");
    }
    this.#baseUrl = url.origin;
    this.#authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
    this.#fetch = fetchImpl;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#sdk = createOpencodeClient({
      baseUrl: this.#baseUrl,
      headers: { authorization: this.#authorization },
      fetch: (request) => this.#fetchSdkRequest(request),
    });
  }

  health(options = {}) {
    return this.#call((sdkOptions) => this.#sdk.global.health(sdkOptions), options);
  }

  providers(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.config.providers({ directory }, sdkOptions), options);
  }

  agents(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.app.agents({ directory }, sdkOptions), options);
  }

  commands(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.command.list({ directory }, sdkOptions), options);
  }

  listSessions(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.list({
      directory,
      roots: true,
      limit: options.limit ?? 100,
    }, sdkOptions), options);
  }

  sessionStatus(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.status({ directory }, sdkOptions), options);
  }

  permissions(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.permission.list({ directory }, sdkOptions), options);
  }

  questions(directory, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.question.list({ directory }, sdkOptions), options);
  }

  createSession({ directory, title, model, agent, permission, metadata }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.create({
      directory,
      ...(title ? { title } : {}),
      ...(agent ? { agent } : {}),
      ...(model ? { model: { providerID: model.providerID, id: model.modelID, ...(model.variant ? { variant: model.variant } : {}) } } : {}),
      ...(Array.isArray(permission) ? { permission } : {}),
      ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { metadata } : {}),
    }, sdkOptions), options);
  }

  getSession({ directory, sessionID }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.get({ directory, sessionID }, sdkOptions), options);
  }

  updateSession({ directory, sessionID, title, archivedAt, permission }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.update({
      directory,
      sessionID,
      ...(title ? { title } : {}),
      ...(archivedAt !== undefined ? { time: { archived: archivedAt } } : {}),
      ...(Array.isArray(permission) ? { permission } : {}),
    }, sdkOptions), options);
  }

  deleteSession({ directory, sessionID }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.delete({ directory, sessionID }, sdkOptions), options);
  }

  forkSession({ directory, sessionID, messageID }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.fork({
      directory,
      sessionID,
      ...(messageID ? { messageID } : {}),
    }, sdkOptions), options);
  }

  abortSession({ directory, sessionID }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.abort({ directory, sessionID }, sdkOptions), options);
  }

  promptAsync({ directory, sessionID, model, agent, variant, system, parts }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.promptAsync({
      directory,
      sessionID,
      ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
      ...(agent ? { agent } : {}),
      ...(variant ? { variant } : {}),
      ...(system ? { system } : {}),
      parts,
    }, sdkOptions), options);
  }

  command({ directory, sessionID, command, arguments: commandArguments = "", model, agent, variant, parts }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.command({
      directory,
      sessionID,
      command,
      arguments: commandArguments,
      ...(model ? { model: `${model.providerID}/${model.modelID}` } : {}),
      ...(agent ? { agent } : {}),
      ...(variant ? { variant } : {}),
      ...(Array.isArray(parts) && parts.length > 0 ? { parts } : {}),
    }, sdkOptions), options);
  }

  messages({ directory, sessionID, limit = 200, before }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.messages({
      directory,
      sessionID,
      limit,
      ...(before ? { before } : {}),
    }, sdkOptions), options);
  }

  summarize({ directory, sessionID, model }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.session.summarize({
      directory,
      sessionID,
      providerID: model.providerID,
      modelID: model.modelID,
      auto: false,
    }, sdkOptions), options);
  }

  replyPermission({ directory, requestID, reply }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.permission.reply({ directory, requestID, reply }, sdkOptions), options);
  }

  replyQuestion({ directory, requestID, answers }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.question.reply({ directory, requestID, answers }, sdkOptions), options);
  }

  rejectQuestion({ directory, requestID }, options = {}) {
    return this.#call((sdkOptions) => this.#sdk.question.reject({ directory, requestID }, sdkOptions), options);
  }

  async #call(operation, { signal, timeoutMs = this.#requestTimeoutMs } = {}) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("OpenCode request timed out."));
    }, timeoutMs);
    timer.unref?.();
    try {
      const result = await operation({ signal: controller.signal, throwOnError: true });
      return result?.data;
    } catch (error) {
      if (timedOut && !signal?.aborted) throw new Error("OpenCode request timed out.");
      const status = Number(error?.cause?.status);
      if (Number.isSafeInteger(status)) {
        throw new OpenCodeHttpError(error instanceof Error ? error.message : String(error), status);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    }
  }

  async #fetchSdkRequest(request) {
    const url = new URL(request.url);
    if (url.origin !== this.#baseUrl || !isAllowedSdkRequest(request.method, url.pathname)) {
      throw new Error("OpenCode SDK attempted an operation outside PuppyOne's allowlist.");
    }
    const headers = Object.fromEntries(request.headers.entries());
    headers.authorization = this.#authorization;
    const body = request.body ? await request.clone().text() : undefined;
    const response = await this.#fetch(url, {
      method: request.method,
      redirect: "error",
      headers,
      ...(body === undefined ? {} : { body }),
      signal: request.signal,
    });
    const bytes = await readBoundedResponse(response, MAX_JSON_RESPONSE_BYTES);
    return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  async subscribeGlobalEvents({ signal, onEvent, onOpen }) {
    const response = await this.#fetch(new URL("/global/event", this.#baseUrl), {
      method: "GET",
      redirect: "error",
      headers: {
        authorization: this.#authorization,
        accept: "text/event-stream",
        "cache-control": "no-cache",
      },
      signal,
    });
    if (!response.ok || !response.body || !response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
      throw new OpenCodeHttpError(`OpenCode event stream failed with HTTP ${response.status}.`, response.status);
    }
    // Reconnect consumers reconcile native history before newly buffered SSE
    // events are released. This prevents an immediately delivered idle event
    // from closing the application turn before missed output is recovered.
    await onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (!signal?.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, "\n");
        if (Buffer.byteLength(buffer, "utf8") > MAX_SSE_EVENT_BYTES * 2) {
          throw new Error("OpenCode event stream buffer exceeded the safety limit.");
        }
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary).replace(/\r/g, "");
          buffer = buffer.slice(boundary + 2);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) {
            if (Buffer.byteLength(data, "utf8") > MAX_SSE_EVENT_BYTES) {
              throw new Error("OpenCode event exceeded the safety limit.");
            }
            const parsed = safeJson(data);
            if (parsed) await onEvent(parsed);
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export class OpenCodeHttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "OpenCodeHttpError";
    this.status = status;
  }
}

export function parseModelSelection(value) {
  if (typeof value !== "string") return null;
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return null;
  const providerID = value.slice(0, slash).trim();
  const withVariant = value.slice(slash + 1).trim();
  const variantSeparator = withVariant.lastIndexOf(":");
  const modelID = variantSeparator > 0 ? withVariant.slice(0, variantSeparator) : withVariant;
  const variant = variantSeparator > 0 ? withVariant.slice(variantSeparator + 1) : undefined;
  if (!providerID || !modelID) return null;
  return { providerID, modelID, ...(variant ? { variant } : {}) };
}

export function formatModelSelection(model) {
  if (!model?.providerID || !model?.modelID) return null;
  return `${model.providerID}/${model.modelID}${model.variant ? `:${model.variant}` : ""}`;
}

function isLoopbackHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function isAllowedSdkRequest(method, pathname) {
  const operation = `${String(method).toUpperCase()} ${pathname}`;
  return [
    /^GET \/global\/health$/,
    /^GET \/config\/providers$/,
    /^GET \/agent$/,
    /^GET \/command$/,
    /^GET \/session$/,
    /^POST \/session$/,
    /^GET \/session\/status$/,
    /^GET \/permission$/,
    /^GET \/question$/,
    /^(?:GET|PATCH|DELETE) \/session\/[A-Za-z0-9:._~-]+$/,
    /^POST \/session\/[A-Za-z0-9:._~-]+\/(?:fork|abort|prompt_async|command|summarize)$/,
    /^GET \/session\/[A-Za-z0-9:._~-]+\/message$/,
    /^POST \/permission\/[A-Za-z0-9:._~-]+\/reply$/,
    /^POST \/question\/[A-Za-z0-9:._~-]+\/(?:reply|reject)$/,
  ].some((pattern) => pattern.test(operation));
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenCode returned malformed JSON.");
  }
}

async function readBoundedResponse(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel?.();
    throw new Error("OpenCode response exceeded the safety limit.");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error("OpenCode response exceeded the safety limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export const openCodeHttpLimits = Object.freeze({
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  maxJsonResponseBytes: MAX_JSON_RESPONSE_BYTES,
  maxSseEventBytes: MAX_SSE_EVENT_BYTES,
});

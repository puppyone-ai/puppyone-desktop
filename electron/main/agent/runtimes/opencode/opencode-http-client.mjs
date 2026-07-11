const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_JSON_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_SSE_EVENT_BYTES = 1024 * 1024;

export class OpenCodeHttpClient {
  #baseUrl;
  #authorization;
  #fetch;
  #requestTimeoutMs;

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
  }

  health(options = {}) {
    return this.request("GET", "/global/health", options);
  }

  providers(directory, options = {}) {
    return this.request("GET", "/config/providers", { ...options, query: { directory } });
  }

  agents(directory, options = {}) {
    return this.request("GET", "/agent", { ...options, query: { directory } });
  }

  commands(directory, options = {}) {
    return this.request("GET", "/command", { ...options, query: { directory } });
  }

  listSessions(directory, options = {}) {
    return this.request("GET", "/session", {
      ...options,
      query: { directory, roots: "true", limit: options.limit ?? 100 },
    });
  }

  sessionStatus(directory, options = {}) {
    return this.request("GET", "/session/status", { ...options, query: { directory } });
  }

  permissions(directory, options = {}) {
    return this.request("GET", "/permission", { ...options, query: { directory } });
  }

  questions(directory, options = {}) {
    return this.request("GET", "/question", { ...options, query: { directory } });
  }

  createSession({ directory, title, model, agent, permission, metadata }, options = {}) {
    return this.request("POST", "/session", {
      ...options,
      query: { directory },
      body: {
        ...(title ? { title } : {}),
        ...(agent ? { agent } : {}),
        ...(model ? { model: { providerID: model.providerID, id: model.modelID, ...(model.variant ? { variant: model.variant } : {}) } } : {}),
        ...(Array.isArray(permission) ? { permission } : {}),
        ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { metadata } : {}),
      },
    });
  }

  getSession({ directory, sessionID }, options = {}) {
    return this.request("GET", `/session/${encodeURIComponent(sessionID)}`, { ...options, query: { directory } });
  }

  updateSession({ directory, sessionID, title, archivedAt, permission }, options = {}) {
    return this.request("PATCH", `/session/${encodeURIComponent(sessionID)}`, {
      ...options,
      query: { directory },
      body: {
        ...(title ? { title } : {}),
        ...(archivedAt !== undefined ? { time: { archived: archivedAt } } : {}),
        ...(Array.isArray(permission) ? { permission } : {}),
      },
    });
  }

  deleteSession({ directory, sessionID }, options = {}) {
    return this.request("DELETE", `/session/${encodeURIComponent(sessionID)}`, { ...options, query: { directory } });
  }

  forkSession({ directory, sessionID, messageID }, options = {}) {
    return this.request("POST", `/session/${encodeURIComponent(sessionID)}/fork`, {
      ...options,
      query: { directory },
      body: messageID ? { messageID } : {},
    });
  }

  abortSession({ directory, sessionID }, options = {}) {
    return this.request("POST", `/session/${encodeURIComponent(sessionID)}/abort`, { ...options, query: { directory } });
  }

  promptAsync({ directory, sessionID, model, agent, variant, system, parts }, options = {}) {
    return this.request("POST", `/session/${encodeURIComponent(sessionID)}/prompt_async`, {
      ...options,
      query: { directory },
      body: {
        ...(model ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
        ...(agent ? { agent } : {}),
        ...(variant ? { variant } : {}),
        ...(system ? { system } : {}),
        parts,
      },
    });
  }

  command({ directory, sessionID, command, arguments: commandArguments = "", model, agent, variant, parts }, options = {}) {
    return this.request("POST", `/session/${encodeURIComponent(sessionID)}/command`, {
      ...options,
      query: { directory },
      body: {
        command,
        arguments: commandArguments,
        ...(model ? { model: `${model.providerID}/${model.modelID}` } : {}),
        ...(agent ? { agent } : {}),
        ...(variant ? { variant } : {}),
        ...(Array.isArray(parts) && parts.length > 0 ? { parts } : {}),
      },
    });
  }

  messages({ directory, sessionID, limit = 200, before }, options = {}) {
    return this.request("GET", `/session/${encodeURIComponent(sessionID)}/message`, {
      ...options,
      query: { directory, limit, ...(before ? { before } : {}) },
    });
  }

  summarize({ directory, sessionID, model }, options = {}) {
    return this.request("POST", `/session/${encodeURIComponent(sessionID)}/summarize`, {
      ...options,
      query: { directory },
      body: { providerID: model.providerID, modelID: model.modelID, auto: false },
    });
  }

  replyPermission({ directory, requestID, reply }, options = {}) {
    return this.request("POST", `/permission/${encodeURIComponent(requestID)}/reply`, {
      ...options,
      query: { directory },
      body: { reply },
    });
  }

  replyQuestion({ directory, requestID, answers }, options = {}) {
    return this.request("POST", `/question/${encodeURIComponent(requestID)}/reply`, {
      ...options,
      query: { directory },
      body: { answers },
    });
  }

  rejectQuestion({ directory, requestID }, options = {}) {
    return this.request("POST", `/question/${encodeURIComponent(requestID)}/reject`, {
      ...options,
      query: { directory },
    });
  }

  async request(method, pathname, { query, body, signal, timeoutMs = this.#requestTimeoutMs } = {}) {
    const url = new URL(pathname, this.#baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("OpenCode request timed out.")), timeoutMs);
    timer.unref?.();
    try {
      const response = await this.#fetch(url, {
        method,
        redirect: "error",
        headers: {
          authorization: this.#authorization,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const bytes = await readBoundedResponse(response, MAX_JSON_RESPONSE_BYTES);
      const text = new TextDecoder().decode(bytes);
      const value = text.trim() ? safeJson(text) : null;
      if (!response.ok) {
        const message = readErrorMessage(value) || `OpenCode request failed with HTTP ${response.status}.`;
        throw new OpenCodeHttpError(message, response.status);
      }
      return value;
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) throw new Error("OpenCode request timed out.");
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    }
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

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("OpenCode returned malformed JSON.");
  }
}

function readErrorMessage(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  if (value.error && typeof value.error === "object" && typeof value.error.message === "string") return value.error.message;
  if (value.data && typeof value.data === "object" && typeof value.data.message === "string") return value.data.message;
  return "";
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

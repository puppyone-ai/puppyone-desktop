import fs from "node:fs";
import http from "node:http";

const MAX_CALLBACK_BYTES = 1024 * 1024;

export function createOnlyOfficeBridgeServer({ bindHost, bindPort, publicUrl, resolveSource, handleCallback }) {
  let server = null;
  let address = null;

  async function start() {
    if (server) return address;
    server = http.createServer((request, response) => {
      void routeRequest(request, response).catch((error) => {
        if (response.headersSent) {
          response.destroy(error);
          return;
        }
        sendJson(response, error?.statusCode ?? 500, { error: 1, message: safeMessage(error) });
      });
    });
    server.requestTimeout = 35_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(bindPort, bindHost, () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    const socketAddress = server.address();
    const port = typeof socketAddress === "object" && socketAddress ? socketAddress.port : bindPort;
    address = {
      bindHost,
      port,
      publicBaseUrl: publicUrl
        ? publicUrl.replaceAll("{port}", String(port))
        : `http://${formatHost(bindHost)}:${port}`,
    };
    return address;
  }

  async function routeRequest(request, response) {
    const base = address?.publicBaseUrl ?? `http://${formatHost(bindHost)}:${bindPort || 80}`;
    const url = new URL(request.url ?? "/", base);
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (request.method === "GET" && segments[0] === "office" && segments[1] === "sessions" && segments[3] === "source") {
      const source = await resolveSource({ sessionId: segments[2], token: url.searchParams.get("token") });
      response.writeHead(200, {
        "Content-Type": source.mimeType,
        "Content-Length": source.size,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(source.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(source.filePath);
        stream.once("error", reject);
        response.once("close", resolve);
        response.once("finish", resolve);
        stream.pipe(response);
      });
      return;
    }
    if (request.method === "POST" && segments[0] === "office" && segments[1] === "sessions" && segments[3] === "callback") {
      const body = await readJsonBody(request);
      const result = await handleCallback({
        sessionId: segments[2],
        token: url.searchParams.get("token"),
        authorization: request.headers.authorization ?? null,
        body,
      });
      sendJson(response, 200, result ?? { error: 0 });
      return;
    }
    sendJson(response, 404, { error: 1, message: "Not found." });
  }

  async function close() {
    const active = server;
    server = null;
    address = null;
    if (!active) return;
    await new Promise((resolve) => active.close(() => resolve()));
  }

  return Object.freeze({ start, close });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_CALLBACK_BYTES) {
      const error = new Error("Callback body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Callback body must be JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(response, status, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
  });
  response.end(bytes);
}

function safeMessage(error) {
  return error instanceof Error ? error.message.slice(0, 500) : "Office bridge request failed.";
}

function formatHost(host) {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

import http from "node:http";

const CALLBACK_PATH = "/auth/callback";
const MAX_CALLBACK_URL_LENGTH = 8 * 1024;

export async function startLoopbackCallbackServer({
  onCallback,
  host = "127.0.0.1",
  logger = console,
} = {}) {
  if (typeof onCallback !== "function") {
    throw new TypeError("Loopback callback onCallback is required.");
  }

  let accepted = false;
  let redirectUri = null;
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" || typeof request.url !== "string" || request.url.length > MAX_CALLBACK_URL_LENGTH) {
      respond(response, 404, "PuppyOne sign-in callback was not recognized.");
      return;
    }
    if (!redirectUri) {
      respond(response, 503, "PuppyOne sign-in callback is not ready yet.");
      return;
    }

    const callbackUrl = new URL(request.url, redirectUri);
    if (callbackUrl.pathname !== CALLBACK_PATH || accepted) {
      respond(response, accepted ? 409 : 404, accepted
        ? "This PuppyOne sign-in callback has already been used."
        : "PuppyOne sign-in callback was not recognized.");
      return;
    }

    accepted = true;
    respond(response, 200, "Sign-in returned to PuppyOne Desktop. You can close this browser tab.");
    void close().finally(() => {
      Promise.resolve(onCallback(callbackUrl.toString())).catch((error) => {
        logger.warn?.("PuppyOne loopback callback failed.", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  });

  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port: 0, exclusive: true });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await close();
    throw new Error("Unable to determine the OAuth loopback callback port.");
  }
  redirectUri = `http://${host}:${address.port}${CALLBACK_PATH}`;
  server.unref?.();

  async function close() {
    if (!server.listening) return;
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    redirectUri,
    close,
  };
}

function respond(response, status, message) {
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PuppyOne Desktop</title></head><body><main><h1>PuppyOne Desktop</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Connection: "close",
  });
  response.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

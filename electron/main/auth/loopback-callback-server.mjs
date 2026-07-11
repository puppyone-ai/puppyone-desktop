import http from "node:http";

const CALLBACK_PATH = "/auth/callback";
const MAX_CALLBACK_URL_LENGTH = 8 * 1024;

export async function startLoopbackCallbackServer({
  onCallback,
  isExpectedCallback,
  host = "127.0.0.1",
  logger = console,
} = {}) {
  if (typeof onCallback !== "function") {
    throw new TypeError("Loopback callback onCallback is required.");
  }
  if (typeof isExpectedCallback !== "function") {
    throw new TypeError("Loopback callback isExpectedCallback is required.");
  }

  let handled = false;
  let redirectUri = null;
  const server = http.createServer(async (request, response) => {
    if (request.method !== "GET" || typeof request.url !== "string" || request.url.length > MAX_CALLBACK_URL_LENGTH) {
      respond(response, 404, "PuppyOne sign-in callback was not recognized.");
      return;
    }
    if (!redirectUri) {
      respond(response, 503, "PuppyOne sign-in callback is not ready yet.");
      return;
    }

    const callbackUrl = new URL(request.url, redirectUri);
    const serializedCallbackUrl = callbackUrl.toString();
    if (callbackUrl.pathname !== CALLBACK_PATH || handled) {
      respond(response, handled ? 409 : 404, handled
        ? "This PuppyOne sign-in callback has already been used."
        : "PuppyOne sign-in callback was not recognized.");
      return;
    }
    if (!isExpectedCallback(serializedCallbackUrl)) {
      respond(response, 400, "PuppyOne sign-in state did not match this Desktop request.");
      return;
    }

    handled = true;
    // Stop accepting new callbacks immediately, but never wait for close()
    // before exchanging the one-time code: the active browser connection is
    // itself what close() waits for.
    void close().catch((error) => {
      logger.warn?.("PuppyOne loopback callback listener did not close cleanly.", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    try {
      const session = await onCallback(serializedCallbackUrl);
      respond(
        response,
        session ? 200 : 400,
        session
          ? "Sign-in completed in PuppyOne Desktop. You can close this browser tab."
          : "PuppyOne Desktop could not complete sign-in. Return to the app and try again.",
      );
    } catch (error) {
      logger.warn?.("PuppyOne loopback callback failed.", {
        error: error instanceof Error ? error.message : String(error),
      });
      respond(response, 500, "PuppyOne Desktop could not complete sign-in. Return to the app and try again.");
    }
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
  const redirectHost = host.includes(":") ? `[${host}]` : host;
  redirectUri = `http://${redirectHost}:${address.port}${CALLBACK_PATH}`;
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

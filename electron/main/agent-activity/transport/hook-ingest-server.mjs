import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { AGENT_ACTIVITY_LIMITS } from "../../../../shared/agent-activity-contract/constants.mjs";
import { parseHookIngestEnvelope } from "../security/activity-frame-policy.mjs";

export function createHookIngestServer({
  auth,
  onEnvelope,
  runtimeDirectory,
  logger = console,
  platform = process.platform,
  userId = typeof process.getuid === "function" ? process.getuid() : process.pid,
} = {}) {
  let server = null;
  let endpoint = null;
  let startPromise = null;
  const sockets = new Set();

  async function start() {
    if (server && endpoint) return endpoint;
    if (startPromise) return startPromise;
    startPromise = startServer();
    try {
      return await startPromise;
    } finally {
      startPromise = null;
    }
  }

  async function startServer() {
    endpoint = resolveEndpoint({ runtimeDirectory, platform, userId });
    if (platform !== "win32") {
      await fs.mkdir(path.dirname(endpoint), { recursive: true, mode: 0o700 });
      await fs.chmod(path.dirname(endpoint), 0o700).catch(() => undefined);
      await fs.unlink(endpoint).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    const nextServer = net.createServer((socket) => acceptSocket(socket));
    nextServer.on("error", (error) => logger.warn("Agent activity ingest server error:", error));
    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      nextServer.once("error", onError);
      nextServer.listen(endpoint, () => {
        nextServer.off("error", onError);
        resolve();
      });
    });
    server = nextServer;
    if (platform !== "win32") await fs.chmod(endpoint, 0o600).catch(() => undefined);
    return endpoint;
  }

  function acceptSocket(socket) {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(1_000, () => socket.destroy());
    let buffer = "";
    let receivedBytes = 0;
    socket.on("data", (chunk) => {
      receivedBytes += Buffer.byteLength(chunk, "utf8");
      if (receivedBytes > AGENT_ACTIVITY_LIMITS.frameBytes) {
        socket.destroy();
        return;
      }
      buffer += chunk;
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      const frame = buffer.slice(0, newlineIndex);
      buffer = "";
      void processFrame(frame).finally(() => socket.end());
    });
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
  }

  async function processFrame(frame) {
    let value;
    try {
      value = JSON.parse(frame);
    } catch {
      return false;
    }
    const envelope = parseHookIngestEnvelope(value);
    if (!envelope || !auth.verify(envelope)) return false;
    try {
      return await onEnvelope(envelope);
    } catch (error) {
      logger.warn("Agent activity envelope was dropped:", error);
      return false;
    }
  }

  async function dispose() {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    const activeServer = server;
    const activeEndpoint = endpoint;
    server = null;
    endpoint = null;
    if (activeServer) {
      await new Promise((resolve) => activeServer.close(() => resolve()));
    }
    if (activeEndpoint && platform !== "win32") {
      await fs.unlink(activeEndpoint).catch(() => undefined);
    }
  }

  return Object.freeze({ start, dispose, processFrame });
}

export function resolveEndpoint({ runtimeDirectory, platform, userId }) {
  const identity = createHash("sha256")
    .update(String(runtimeDirectory ?? "puppyone"))
    .digest("hex")
    .slice(0, 12);
  if (platform === "win32") return `\\\\.\\pipe\\puppyone-agent-activity-${userId}-${identity}`;
  const preferred = path.join(runtimeDirectory, "activity.sock");
  return Buffer.byteLength(preferred, "utf8") <= 96
    ? preferred
    : path.join(os.tmpdir(), `puppyone-aa-${userId}-${identity}`, "activity.sock");
}

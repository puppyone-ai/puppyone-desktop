#!/usr/bin/env node

import net from "node:net";
import { fileURLToPath } from "node:url";
import { projectAgentHookPayload } from "./payload-projector.mjs";

const FRAME_BYTES = 64 * 1024;
const SCHEMA_VERSION = 1;

export async function forwardHookInput({
  environment = process.env,
  input = process.stdin,
  connect = (endpoint) => net.createConnection(endpoint),
} = {}) {
  const endpoint = environment.PUPPYONE_AGENT_ACTIVITY_ENDPOINT;
  const token = environment.PUPPYONE_AGENT_ACTIVITY_TOKEN;
  const providerId = environment.PUPPYONE_AGENT_ACTIVITY_PROVIDER
    || readProviderArgument(process.argv);
  const terminalSessionId = environment.PUPPYONE_AGENT_ACTIVITY_TERMINAL_SESSION_ID;
  if (![endpoint, token, providerId, terminalSessionId].every((value) => typeof value === "string" && value)) {
    return false;
  }
  const raw = await readBoundedStdin(input, FRAME_BYTES * 4);
  if (!raw) return false;
  let nativePayload;
  try {
    nativePayload = JSON.parse(raw);
  } catch {
    return false;
  }
  const payload = projectAgentHookPayload(nativePayload);
  if (!payload) return false;
  const frame = `${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    terminalSessionId,
    providerId,
    token,
    payload,
  })}\n`;
  if (Buffer.byteLength(frame, "utf8") > FRAME_BYTES) return false;
  return sendFrame(connect(endpoint), frame);
}

function readProviderArgument(argv) {
  const index = argv.indexOf("--provider");
  const value = index >= 0 ? argv[index + 1] : null;
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/u.test(value)
    ? value
    : null;
}

function readBoundedStdin(input, limit) {
  return new Promise((resolve) => {
    let value = "";
    let size = 0;
    input.setEncoding?.("utf8");
    input.on("data", (chunk) => {
      size += Buffer.byteLength(chunk, "utf8");
      if (size > limit) {
        value = "";
        input.destroy?.();
        resolve(null);
        return;
      }
      value += chunk;
    });
    input.on("end", () => resolve(value || null));
    input.on("error", () => resolve(null));
  });
}

function sendFrame(socket, frame) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(200, () => finish(false));
    socket.once("connect", () => socket.end(frame, () => finish(true)));
    socket.once("error", () => finish(false));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void forwardHookInput().catch(() => undefined).finally(() => {
    process.exitCode = 0;
  });
}

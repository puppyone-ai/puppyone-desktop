import {
  createNativeReferenceSmokeFixtures,
  createNativeReferenceSmokeTokens,
} from "./native-agent-reference-smoke-fixtures.mjs";

const DEFAULT_TIMEOUT_MS = 180_000;

export class NativeAgentReferenceSmokeError extends Error {
  constructor(runtimeId, stage, code = "runtime") {
    super(`Native Agent reference smoke failed for ${runtimeId} during ${stage}.`);
    this.name = "NativeAgentReferenceSmokeError";
    this.runtimeId = runtimeId;
    this.stage = stage;
    this.code = code;
  }
}

/**
 * Runs a credentialed model-visibility check through AgentService and one real
 * or fake native Harness. Raw provider output, fixture paths and random tokens
 * are never returned or attached to failures.
 */
export async function runNativeAgentReferenceSmoke({
  service,
  sender,
  workspaceRoot,
  attachmentRoot,
  runtimeId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  tokenFactory = createNativeReferenceSmokeTokens,
}) {
  let activeSessionId = null;
  let stage = "create";
  try {
    const created = await service.createSession(sender, { runtimeId }, workspaceRoot);
    activeSessionId = requiredSessionId(created, runtimeId, stage);
    const model = requiredModelId(created, runtimeId);
    const input = requiredReferenceCapabilities(created, runtimeId);
    const tokens = tokenFactory();
    const fixtures = await createNativeReferenceSmokeFixtures({
      workspaceRoot,
      attachmentRoot,
      tokens,
    });

    stage = "unsupported-binary";
    await requireUnsupportedBinaryRejection({
      service,
      sender,
      workspaceRoot,
      sessionId: activeSessionId,
      reference: fixtures.unsupported,
      runtimeId,
      input,
    });

    stage = "model-visibility";
    const selected = selectSupportedReferences(input, fixtures, runtimeId);
    const waiter = createTurnWaiter(sender, activeSessionId, timeoutMs);
    try {
      await service.startTurn(sender, {
        sessionId: activeSessionId,
        prompt: visibilityPrompt(selected.expected.length),
        references: selected.references,
      }, workspaceRoot);
      const answer = await waiter.promise;
      if (!selected.expected.every((token) => answer.includes(token))) {
        throw new NativeAgentReferenceSmokeError(runtimeId, stage, "content-not-visible");
      }
    } finally {
      waiter.cancel();
    }

    stage = "close";
    await service.closeSession(sender, {
      sessionId: activeSessionId,
      removePersistence: true,
    }, workspaceRoot);
    activeSessionId = null;

    return Object.freeze({
      runtimeId,
      model,
      status: "passed",
      checks: Object.freeze(["capability", "unsupported-binary", "model-visibility", "close"]),
      testedInputs: Object.freeze(selected.testedInputs),
    });
  } catch (error) {
    if (error instanceof NativeAgentReferenceSmokeError) throw error;
    throw new NativeAgentReferenceSmokeError(runtimeId, stage, classifyFailure(error));
  } finally {
    if (activeSessionId) {
      await Promise.resolve(service.closeSession(sender, {
        sessionId: activeSessionId,
        removePersistence: true,
      }, workspaceRoot)).catch(() => {});
    }
  }
}

function requiredReferenceCapabilities(snapshot, runtimeId) {
  const input = snapshot?.capabilities?.referenceInputs;
  if (!input || input.schemaVersion !== 1 || input.workspace?.files !== true) {
    throw new NativeAgentReferenceSmokeError(runtimeId, "capability", "workspace-file-unavailable");
  }
  for (const kind of ["image", "text", "audio", "video", "binary"]) {
    if (typeof input.attachments?.[kind]?.accepted !== "boolean") {
      throw new NativeAgentReferenceSmokeError(runtimeId, "capability", "invalid-capability-contract");
    }
  }
  return input;
}

function selectSupportedReferences(input, fixtures, runtimeId) {
  const references = [fixtures.workspace];
  const expected = [fixtures.tokens.workspace];
  const testedInputs = ["workspace-text"];
  if (input.attachments.image.accepted) {
    references.push(fixtures.image);
    expected.push(fixtures.tokens.image);
    testedInputs.push("staged-image");
  }
  if (input.attachments.text.accepted) {
    references.push(fixtures.externalText);
    expected.push(fixtures.tokens.externalText);
    testedInputs.push("staged-utf8-text");
  }
  if (references.length === 0) {
    throw new NativeAgentReferenceSmokeError(runtimeId, "capability", "no-supported-reference-input");
  }
  return { references, expected, testedInputs };
}

async function requireUnsupportedBinaryRejection({
  service,
  sender,
  workspaceRoot,
  sessionId,
  reference,
  runtimeId,
  input,
}) {
  if (input.attachments.binary.accepted) {
    throw new NativeAgentReferenceSmokeError(runtimeId, "capability", "unexpected-generic-binary-support");
  }
  let result;
  try {
    result = await service.startTurn(sender, {
      sessionId,
      prompt: "This unsupported reference must be rejected before a native turn starts.",
      references: [reference],
    }, workspaceRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/reference|attachment|binary|pdf|unsupported|does not accept/iu.test(message)) return;
    throw new NativeAgentReferenceSmokeError(runtimeId, "unsupported-binary", "unexpected-rejection");
  }
  if (result?.turnId && typeof service.interruptTurn === "function") {
    await Promise.resolve(service.interruptTurn(sender, {
      sessionId,
      turnId: result.turnId,
    }, workspaceRoot)).catch(() => {});
  }
  throw new NativeAgentReferenceSmokeError(runtimeId, "unsupported-binary", "unexpected-native-turn");
}

function visibilityPrompt(expectedCount) {
  return [
    `Read all ${expectedCount} attached references.`,
    "Return every uppercase token found inside their contents, one token per line.",
    "Do not infer tokens from filenames and do not add commentary.",
  ].join(" ");
}

function createTurnWaiter(sender, sessionId, timeoutMs) {
  let settled = false;
  let text = "";
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const onEvent = (event) => {
    if (settled || event?.sessionId !== sessionId) return;
    if (event.type === "assistant.delta" && typeof event.payload?.delta === "string") {
      text = appendBounded(text, event.payload.delta);
    }
    if (event.type === "assistant.completed" && typeof event.payload?.text === "string") {
      text = appendBounded(text, event.payload.text);
    }
    if (event.type === "turn.completed") settle(() => resolvePromise(text));
    if (event.type === "turn.failed" || event.type === "turn.interrupted") {
      settle(() => rejectPromise(new Error("Agent reference turn did not complete.")));
    }
  };
  const settle = (finish) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    sender.off("agent:event", onEvent);
    finish();
  };
  const timer = setTimeout(() => {
    settle(() => rejectPromise(new Error("Agent reference turn timed out.")));
  }, boundedTimeout(timeoutMs));
  sender.on("agent:event", onEvent);
  return {
    promise,
    cancel: () => settle(() => resolvePromise(text)),
  };
}

function requiredSessionId(snapshot, runtimeId, stage) {
  const value = snapshot?.session?.id;
  if (typeof value !== "string" || !/^[A-Za-z0-9:._-]{1,256}$/u.test(value)) {
    throw new NativeAgentReferenceSmokeError(runtimeId, stage, "invalid-session");
  }
  return value;
}

function requiredModelId(snapshot, runtimeId) {
  const value = snapshot?.session?.selectedModel;
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u.test(value)) {
    throw new NativeAgentReferenceSmokeError(runtimeId, "capability", "model-unavailable");
  }
  return value;
}

function appendBounded(previous, value) {
  return `${previous}${value}`.slice(-256 * 1024);
}

function boundedTimeout(value) {
  return Number.isFinite(value) && value >= 1_000
    ? Math.min(Math.floor(value), 10 * 60_000)
    : DEFAULT_TIMEOUT_MS;
}

function classifyFailure(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/timed?\s*out|timeout/iu.test(message)) return "timeout";
  if (/auth|sign[ -]?in|login|credential|api[ _-]?key|account/iu.test(message)) return "authentication";
  if (/model|provider/iu.test(message)) return "model-unavailable";
  if (/enoent|spawn|executable|command not found|not installed/iu.test(message)) return "process-launch";
  if (/protocol|json-?rpc|initialize|handshake|parse error/iu.test(message)) return "protocol";
  if (/workspace|working directory|\bcwd\b|directory/iu.test(message)) return "workspace";
  if (/reference|attachment|mime|file/iu.test(message)) return "reference";
  return "runtime";
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNativeReferenceSmokeFixtures,
  renderTokenPng,
} from "../scripts/native-agent-reference-smoke-fixtures.mjs";
import {
  NativeAgentReferenceSmokeError,
  runNativeAgentReferenceSmoke,
} from "../scripts/native-agent-reference-smoke-runner.mjs";
import {
  NATIVE_AGENT_RUNTIME_IDS,
  nativeAgentSmokeTimeout,
  requestedNativeAgentRuntimeIds,
  safeNativeAgentReadinessStatus,
} from "../scripts/native-agent-smoke-runtime-selection.mjs";

const TOKEN_SET = Object.freeze({
  workspace: "WKS_A1B2C3D4",
  image: "IMG_A1B2C3D4",
  externalText: "EXT_A1B2C3D4",
});
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    fs.promises.rm(root, { recursive: true, force: true })
  )));
});

describe("native Agent reference visibility smoke", () => {
  it.each([
    ["puppyone-agent", true, true, ["workspace-text", "staged-image", "staged-utf8-text"]],
    ["codex", true, false, ["workspace-text", "staged-image"]],
    ["claude", true, false, ["workspace-text", "staged-image"]],
    ["cursor", true, false, ["workspace-text", "staged-image"]],
    ["opencode-native", true, true, ["workspace-text", "staged-image", "staged-utf8-text"]],
  ])("proves only the negotiated %s input set is model-visible", async (
    runtimeId,
    imageAccepted,
    textAccepted,
    expectedInputs,
  ) => {
    const roots = await smokeRoots();
    const sender = smokeSender();
    const service = fakeService({
      sender,
      runtimeId,
      capabilities: referenceCapabilities({ imageAccepted, textAccepted }),
      answer: expectedAnswer({ imageAccepted, textAccepted }),
    });

    await expect(runNativeAgentReferenceSmoke({
      service,
      sender,
      ...roots,
      runtimeId,
      timeoutMs: 1_000,
      tokenFactory: () => TOKEN_SET,
    })).resolves.toEqual({
      runtimeId,
      model: "fixture/model",
      status: "passed",
      checks: ["capability", "unsupported-binary", "model-visibility", "close"],
      testedInputs: expectedInputs,
    });

    expect(service.startTurn).toHaveBeenCalledTimes(2);
    const rejected = service.startTurn.mock.calls[0][1];
    const submitted = service.startTurn.mock.calls[1][1];
    expect(rejected.references).toEqual([
      expect.objectContaining({ mime: "application/pdf", authorized: true }),
    ]);
    expect(submitted.prompt).not.toMatch(/(?:WKS|IMG|EXT)_A1B2C3D4/u);
    expect(submitted.references.map((reference) => reference.displayName)).toEqual([
      "workspace-context.txt",
      ...(imageAccepted ? ["visual-context.png"] : []),
      ...(textAccepted ? ["external-context.txt"] : []),
    ]);
    expect(submitted.references.every((reference) => reference.authorized === true)).toBe(true);
    expect(service.closeSession).toHaveBeenCalledWith(sender, {
      sessionId: "product-session",
      removePersistence: true,
    }, roots.workspaceRoot);
  });

  it("degrades to workspace-path verification when optional ACP inputs were not negotiated", async () => {
    const roots = await smokeRoots();
    const sender = smokeSender();
    const service = fakeService({
      sender,
      runtimeId: "cursor",
      capabilities: referenceCapabilities({ imageAccepted: false, textAccepted: false }),
      answer: TOKEN_SET.workspace,
    });

    const result = await runNativeAgentReferenceSmoke({
      service,
      sender,
      ...roots,
      runtimeId: "cursor",
      timeoutMs: 1_000,
      tokenFactory: () => TOKEN_SET,
    });

    expect(result.testedInputs).toEqual(["workspace-text"]);
    expect(service.startTurn.mock.calls[1][1].references).toEqual([
      expect.objectContaining({ kind: "workspace-entry", mime: "text/plain" }),
    ]);
  });

  it("fails when a native turn completes without every submitted content token", async () => {
    const roots = await smokeRoots();
    const sender = smokeSender();
    const service = fakeService({
      sender,
      runtimeId: "codex",
      capabilities: referenceCapabilities({ imageAccepted: true, textAccepted: false }),
      answer: TOKEN_SET.workspace,
    });

    await expect(runNativeAgentReferenceSmoke({
      service,
      sender,
      ...roots,
      runtimeId: "codex",
      timeoutMs: 1_000,
      tokenFactory: () => TOKEN_SET,
    })).rejects.toMatchObject({
      name: NativeAgentReferenceSmokeError.name,
      runtimeId: "codex",
      stage: "model-visibility",
      code: "content-not-visible",
    });
    expect(service.closeSession).toHaveBeenCalled();
  });

  it("fails before sending when a runtime unexpectedly advertises generic binary input", async () => {
    const roots = await smokeRoots();
    const sender = smokeSender();
    const capabilities = referenceCapabilities({ imageAccepted: true, textAccepted: false });
    capabilities.referenceInputs.attachments.binary.accepted = true;
    const service = fakeService({ sender, runtimeId: "codex", capabilities, answer: "" });

    await expect(runNativeAgentReferenceSmoke({
      service,
      sender,
      ...roots,
      runtimeId: "codex",
      timeoutMs: 1_000,
      tokenFactory: () => TOKEN_SET,
    })).rejects.toMatchObject({
      stage: "capability",
      code: "unexpected-generic-binary-support",
    });
    expect(service.startTurn).not.toHaveBeenCalled();
  });

  it("requires an explicit selected model before claiming service visibility", async () => {
    const roots = await smokeRoots();
    const sender = smokeSender();
    const service = fakeService({
      sender,
      runtimeId: "codex",
      capabilities: referenceCapabilities({ imageAccepted: true, textAccepted: false }),
      answer: expectedAnswer({ imageAccepted: true, textAccepted: false }),
    });
    service.createSession.mockResolvedValueOnce({
      session: { id: "product-session", runtimeId: "codex", providerSessionId: "native-session" },
      capabilities: referenceCapabilities({ imageAccepted: true, textAccepted: false }),
    });

    await expect(runNativeAgentReferenceSmoke({
      service,
      sender,
      ...roots,
      runtimeId: "codex",
      timeoutMs: 1_000,
      tokenFactory: () => TOKEN_SET,
    })).rejects.toMatchObject({
      stage: "capability",
      code: "model-unavailable",
    });
    expect(service.startTurn).not.toHaveBeenCalled();
  });

  it("does not retain provider diagnostics, fixture paths or content tokens in failures", async () => {
    const roots = await smokeRoots();
    const sender = smokeSender();
    const service = {
      createSession: vi.fn(async () => {
        throw new Error(`authentication failed near ${roots.workspaceRoot}/${TOKEN_SET.workspace}`);
      }),
      closeSession: vi.fn(),
    };

    const failure = await runNativeAgentReferenceSmoke({
      service,
      sender,
      ...roots,
      runtimeId: "codex",
      timeoutMs: 1_000,
      tokenFactory: () => TOKEN_SET,
    }).catch((error) => error);

    expect(failure).toMatchObject({
      name: "NativeAgentReferenceSmokeError",
      stage: "create",
      code: "authentication",
    });
    expect(failure).not.toHaveProperty("cause");
    expect(failure.message).not.toContain(roots.workspaceRoot);
    expect(failure.message).not.toContain(TOKEN_SET.workspace);
  });

  it("creates bounded real PNG, workspace, text and unsupported fixtures outside the prompt", async () => {
    const roots = await smokeRoots();
    const fixtures = await createNativeReferenceSmokeFixtures({ ...roots, tokens: TOKEN_SET });
    const png = await fs.promises.readFile(fixtures.image.path);

    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.byteLength).toBeLessThan(512 * 1024);
    expect(png.includes(Buffer.from(TOKEN_SET.image))).toBe(false);
    expect(await fs.promises.readFile(fixtures.workspace.path, "utf8")).toBe(`${TOKEN_SET.workspace}\n`);
    expect(await fs.promises.readFile(fixtures.externalText.path, "utf8")).toBe(`${TOKEN_SET.externalText}\n`);
    expect(fixtures.workspace.path.startsWith(roots.workspaceRoot)).toBe(true);
    expect(fixtures.image.path.startsWith(roots.attachmentRoot)).toBe(true);
    expect(fixtures.unsupported).toMatchObject({ mime: "application/pdf", authorized: true });
    expect(() => renderTokenPng("not-safe")).toThrow(/token is invalid/i);
  });
});

describe("native Agent smoke runtime selection", () => {
  it("keeps every shipped Harness in one shared smoke inventory", () => {
    expect(NATIVE_AGENT_RUNTIME_IDS).toEqual([
      "puppyone-agent",
      "codex",
      "claude",
      "cursor",
      "opencode-native",
    ]);
    expect(requestedNativeAgentRuntimeIds(["--runtimes=all"])).toEqual({
      valid: true,
      explicit: true,
      runtimeIds: [...NATIVE_AGENT_RUNTIME_IDS],
    });
    expect(requestedNativeAgentRuntimeIds([], "codex,cursor,codex")).toEqual({
      valid: true,
      explicit: true,
      runtimeIds: ["codex", "cursor"],
    });
    expect(requestedNativeAgentRuntimeIds(["--runtimes=unknown"])).toEqual({
      valid: false,
      explicit: true,
      runtimeIds: [],
    });
  });

  it("bounds live-service timeouts and readiness output", () => {
    expect(nativeAgentSmokeTimeout("999", 180_000)).toBe(180_000);
    expect(nativeAgentSmokeTimeout("900000", 180_000)).toBe(600_000);
    expect(nativeAgentSmokeTimeout("5000", 180_000)).toBe(5_000);
    expect(safeNativeAgentReadinessStatus("authentication-required")).toBe("authentication-required");
    expect(safeNativeAgentReadinessStatus("private-diagnostic")).toBe("unavailable");
  });
});

function fakeService({ sender, runtimeId, capabilities, answer }) {
  return {
    createSession: vi.fn(async () => ({
      session: {
        id: "product-session",
        runtimeId,
        providerSessionId: "native-session",
        selectedModel: "fixture/model",
      },
      capabilities,
    })),
    startTurn: vi.fn(async (_owner, request) => {
      if (request.references?.some((reference) => reference.mime === "application/pdf")) {
        throw new Error("The selected Agent does not accept binary file attachments.");
      }
      queueMicrotask(() => {
        sender.send("agent:event", event(request.sessionId, "assistant.completed", { text: answer }));
        sender.send("agent:event", event(request.sessionId, "turn.completed", { status: "completed" }));
      });
      return { sessionId: request.sessionId, turnId: "turn-visible" };
    }),
    interruptTurn: vi.fn(async () => ({ interrupted: true })),
    closeSession: vi.fn(async () => ({ closed: true })),
  };
}

function referenceCapabilities({ imageAccepted, textAccepted }) {
  return {
    referenceInputs: {
      schemaVersion: 1,
      workspace: { files: true, directories: true },
      attachments: {
        image: { accepted: imageAccepted, mimeTypes: ["image/png"] },
        text: { accepted: textAccepted, mimeTypes: ["text/plain"] },
        audio: { accepted: false },
        video: { accepted: false },
        binary: { accepted: false },
      },
      limits: { maxCount: 32, maxBytesPerReference: 25 * 1024 * 1024, maxTotalBytes: 25 * 1024 * 1024 },
      steer: false,
      attachmentOnly: false,
    },
  };
}

function expectedAnswer({ imageAccepted, textAccepted }) {
  return [
    TOKEN_SET.workspace,
    ...(imageAccepted ? [TOKEN_SET.image] : []),
    ...(textAccepted ? [TOKEN_SET.externalText] : []),
  ].join("\n");
}

async function smokeRoots() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "native-reference-runner-test-"));
  temporaryRoots.push(root);
  const workspaceRoot = path.join(root, "workspace");
  const attachmentRoot = path.join(root, "attachments");
  await fs.promises.mkdir(workspaceRoot, { recursive: true });
  return { workspaceRoot, attachmentRoot };
}

function smokeSender() {
  const sender = new EventEmitter();
  sender.id = 1;
  sender.isDestroyed = () => false;
  sender.send = (channel, payload) => sender.emit(channel, payload);
  return sender;
}

function event(sessionId, type, payload) {
  return { sessionId, runtimeId: "fixture-runtime", type, payload, turnId: "turn-visible" };
}

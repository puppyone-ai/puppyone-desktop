import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceBinaryFileVersion,
  writeWorkspaceBinaryFile,
} from "../local-api/workspace.mjs";
import { createOfficeEditingService } from "../electron/main/office/office-editing-service.mjs";
import { signOnlyOfficeJwt } from "../electron/main/office/onlyoffice-jwt.mjs";

const TEST_JWT_SECRET = "test-secret-with-at-least-sixteen-characters";

let root;
let recoveryRoot;
let services;
const serviceCaptures = new WeakMap();

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "puppyone-office-workspace-"));
  recoveryRoot = await mkdtemp(path.join(os.tmpdir(), "puppyone-office-recovery-"));
  services = [];
});

afterEach(async () => {
  await Promise.all(services.map((service) => service.closeAll()));
  await rm(root, { recursive: true, force: true });
  await rm(recoveryRoot, { recursive: true, force: true });
});

describe("Office editing service", () => {
  it("serves a capability-scoped source and atomically persists a force-save callback", async () => {
    const original = Buffer.from("original-office-bytes");
    const edited = Buffer.from("edited-office-bytes");
    await writeFile(path.join(root, "report.docx"), original);
    const states = [];
    const noteInternalWrite = vi.fn();
    const service = createService({ edited, states, noteInternalWrite });

    const session = await service.createSession({
      ownerId: 42,
      rootPath: root,
      relativePath: "report.docx",
      locale: "en",
    });
    await attachTestSurface(service, session.sessionId, 42);
    const editorConfig = serviceCaptures.get(service).request.editorConfig;
    const sourceResponse = await fetch(editorConfig.document.url);

    expect(sourceResponse.status).toBe(200);
    expect(Buffer.from(await sourceResponse.arrayBuffer())).toEqual(original);
    await expect(service.forceSave({ ownerId: 42, sessionId: session.sessionId })).resolves.toEqual({ accepted: true });
    expect(serviceCaptures.get(service).fetchImpl).toHaveBeenCalledWith(
      expect.stringMatching(/\/command\?shardkey=/),
      expect.objectContaining({ method: "POST" }),
    );

    const callbackResponse = await postCallback(editorConfig, {
      key: editorConfig.document.key,
      status: 6,
      filetype: "docx",
      url: "http://127.0.0.1:9999/saved/report.docx",
    });

    expect(await callbackResponse.json()).toEqual({ error: 0 });
    expect(await readFile(path.join(root, "report.docx"))).toEqual(edited);
    expect(states.at(-1)).toMatchObject({ status: "saved", path: "report.docx" });
    expect(noteInternalWrite).toHaveBeenCalledWith(expect.objectContaining({
      rootPath: root,
      path: "report.docx",
      senderId: 42,
    }));

    const repeatedCallback = await postCallback(editorConfig, {
      key: editorConfig.document.key,
      status: 2,
      filetype: "docx",
      url: "http://127.0.0.1:9999/saved/report.docx",
    });
    expect(await repeatedCallback.json()).toEqual({ error: 0 });
    expect(noteInternalWrite).toHaveBeenCalledTimes(1);
  });

  it("preserves edited bytes for explicit resolution when the file changed externally", async () => {
    const edited = Buffer.from("edited-office-result");
    await writeFile(path.join(root, "book.xlsx"), Buffer.from("opened-version"));
    const states = [];
    const service = createService({ edited, states });
    const session = await service.createSession({
      ownerId: 7,
      rootPath: root,
      relativePath: "book.xlsx",
      locale: "en",
    });
    await attachTestSurface(service, session.sessionId, 7);
    const editorConfig = serviceCaptures.get(service).request.editorConfig;
    await writeFile(path.join(root, "book.xlsx"), Buffer.from("external-version"));

    const callbackResponse = await postCallback(editorConfig, {
      key: editorConfig.document.key,
      status: 2,
      filetype: "xlsx",
      url: "http://127.0.0.1:9999/saved/book.xlsx",
    });

    expect(await callbackResponse.json()).toEqual({ error: 0 });
    expect(await readFile(path.join(root, "book.xlsx"))).toEqual(Buffer.from("external-version"));
    expect(states.at(-1)).toMatchObject({ status: "conflict", recoveryAvailable: true });

    const resolved = await service.resolveConflict({
      ownerId: 7,
      sessionId: session.sessionId,
      resolution: "keep-edited",
    });
    expect(resolved.status).toBe("saved");
    expect(await readFile(path.join(root, "book.xlsx"))).toEqual(edited);
  });

  it("rejects unsigned, body-tampered, and format-mismatched callbacks", async () => {
    const original = Buffer.from("original-office-bytes");
    await writeFile(path.join(root, "slides.pptx"), original);
    const states = [];
    const service = createService({ edited: Buffer.from("untrusted-office-bytes"), states });
    const session = await service.createSession({
      ownerId: 19,
      rootPath: root,
      relativePath: "slides.pptx",
      locale: "en",
    });
    await attachTestSurface(service, session.sessionId, 19);
    const editorConfig = serviceCaptures.get(service).request.editorConfig;
    const callbackBody = {
      key: editorConfig.document.key,
      status: 6,
      filetype: "pptx",
      url: "http://127.0.0.1:9999/saved/slides.pptx",
    };

    const unsignedResponse = await postRawCallback(editorConfig, callbackBody);
    expect(unsignedResponse.status).toBe(500);
    expect(await unsignedResponse.json()).toMatchObject({ error: 1 });

    const tamperedResponse = await postRawCallback(editorConfig, callbackBody, signOnlyOfficeJwt({
      payload: { ...callbackBody, url: "http://127.0.0.1:9999/saved/different.pptx" },
    }, TEST_JWT_SECRET));
    expect(tamperedResponse.status).toBe(500);
    expect(await tamperedResponse.json()).toMatchObject({ error: 1 });

    const wrongFormatBody = { ...callbackBody, filetype: "docx" };
    const wrongFormatResponse = await postRawCallback(
      editorConfig,
      wrongFormatBody,
      signOnlyOfficeJwt({ payload: wrongFormatBody }, TEST_JWT_SECRET),
    );
    expect(wrongFormatResponse.status).toBe(500);
    expect(await wrongFormatResponse.json()).toMatchObject({ error: 1 });

    const unavailableResultBody = {
      ...callbackBody,
      url: "http://127.0.0.1:9999/unavailable/slides.pptx",
    };
    const unavailableResultResponse = await postRawCallback(
      editorConfig,
      unavailableResultBody,
      signOnlyOfficeJwt({ payload: unavailableResultBody }, TEST_JWT_SECRET),
    );
    expect(unavailableResultResponse.status).toBe(500);
    expect(await unavailableResultResponse.json()).toMatchObject({ error: 1 });
    expect(states.at(-1)).toMatchObject({ status: "error" });
    expect(await readFile(path.join(root, "slides.pptx"))).toEqual(original);
  });
});

function createService({ edited, states, noteInternalWrite = vi.fn() }) {
  const ownerWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (_channel, state) => states.push(state),
    },
  };
  const capture = { request: null, fetchImpl: null };
  const surfaceManager = {
    attach: vi.fn(async (request) => {
      capture.request = request;
      return { surfaceId: "test-office-surface", attached: true };
    }),
    setBounds: vi.fn(() => ({ ok: true, visible: true })),
    detach: vi.fn(() => ({ detached: true })),
    destroyOwner: vi.fn(),
    destroyAll: vi.fn(),
  };
  const fetchImpl = vi.fn(async (url) => {
    if (String(url).includes("/command?shardkey=")) {
      return new Response(JSON.stringify({ error: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url).startsWith("http://127.0.0.1:9999/saved/")) {
      return new Response(edited, {
        status: 200,
        headers: { "Content-Length": String(edited.byteLength) },
      });
    }
    throw new Error(`Unexpected engine request: ${url}`);
  });
  capture.fetchImpl = fetchImpl;
  const service = createOfficeEditingService({
    configuration: {
      configured: true,
      reason: null,
      documentServerUrl: "http://127.0.0.1:9999",
      jwtSecret: TEST_JWT_SECRET,
      bindHost: "127.0.0.1",
      bindPort: 0,
      publicUrl: null,
      downloadOrigins: new Set(["http://127.0.0.1:9999"]),
    },
    recoveryRoot,
    readWorkspaceBinaryFileVersion,
    writeWorkspaceBinaryFile,
    absorbWorkspaceEditReviewPath: vi.fn(async () => undefined),
    workspaceWatchService: { noteInternalWrite },
    getOwnerWindow: () => ownerWindow,
    surfaceManager,
    fetchImpl,
  });
  serviceCaptures.set(service, capture);
  services.push(service);
  return service;
}

async function attachTestSurface(service, sessionId, ownerId) {
  await service.attachSurface({
    ownerId,
    sessionId,
    attachmentId: "test-attachment",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
  });
}

async function postCallback(editorConfig, body) {
  return postRawCallback(
    editorConfig,
    body,
    signOnlyOfficeJwt({ payload: body }, TEST_JWT_SECRET),
  );
}

async function postRawCallback(editorConfig, body, token = null) {
  return fetch(editorConfig.editorConfig.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

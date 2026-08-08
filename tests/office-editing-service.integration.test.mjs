import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readWorkspaceBinaryFileVersion,
  writeWorkspaceBinaryFile,
} from "../local-api/workspace.mjs";
import { createOfficeEditingService } from "../electron/main/office/office-editing-service.mjs";

const API_BASE = "https://api.puppyone.ai/api/v1";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

let root;
let recoveryRoot;
let services;

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

describe("managed Office editing service", () => {
  it("uploads through authenticated PuppyOne APIs and atomically persists a force-save result", async () => {
    const original = Buffer.from("original-office-bytes");
    const edited = Buffer.from("edited-office-bytes");
    await writeFile(path.join(root, "report.docx"), original);
    const states = [];
    const noteInternalWrite = vi.fn();
    const fixture = createService({ edited, states, noteInternalWrite });

    const session = await fixture.service.createSession({
      ownerId: 42,
      rootPath: root,
      relativePath: "report.docx",
      locale: "en",
    });
    await attachTestSurface(fixture.service, session.sessionId, 42);

    expect(fixture.upload).toMatchObject({ locale: "en", filename: "report.docx" });
    expect(fixture.upload.bytes).toEqual(original);
    expect(fixture.surfaceManager.attach).toHaveBeenCalledWith(expect.objectContaining({
      apiScriptUrl: "https://office.puppyone.ai/web-apps/apps/api/documents/api.js",
      editorConfig: expect.objectContaining({ token: "backend-signed-config" }),
    }));

    await expect(fixture.service.forceSave({ ownerId: 42, sessionId: session.sessionId }))
      .resolves.toEqual({ accepted: true });
    await vi.waitFor(() => expect(states.at(-1)).toMatchObject({ status: "saved" }));

    expect(await readFile(path.join(root, "report.docx"))).toEqual(edited);
    expect(fixture.requestSessionApi).toHaveBeenCalledWith(
      API_BASE,
      `/office/sessions/${SESSION_ID}/result?revision=1`,
      { method: "GET", responseType: "bytes" },
    );
    expect(noteInternalWrite).toHaveBeenCalledWith(expect.objectContaining({
      rootPath: root,
      path: "report.docx",
      senderId: 42,
    }));
  });

  it("preserves managed result bytes for explicit resolution when the local file changed", async () => {
    const edited = Buffer.from("edited-office-result");
    await writeFile(path.join(root, "book.xlsx"), Buffer.from("opened-version"));
    const states = [];
    const fixture = createService({ edited, states });
    const session = await fixture.service.createSession({
      ownerId: 7,
      rootPath: root,
      relativePath: "book.xlsx",
      locale: "en",
    });
    await writeFile(path.join(root, "book.xlsx"), Buffer.from("external-version"));

    await fixture.service.forceSave({ ownerId: 7, sessionId: session.sessionId });
    await vi.waitFor(() => expect(states.at(-1)).toMatchObject({
      status: "conflict",
      recoveryAvailable: true,
    }));

    expect(await readFile(path.join(root, "book.xlsx"))).toEqual(Buffer.from("external-version"));
    const resolved = await fixture.service.resolveConflict({
      ownerId: 7,
      sessionId: session.sessionId,
      resolution: "keep-edited",
    });
    expect(resolved.status).toBe("saved");
    expect(await readFile(path.join(root, "book.xlsx"))).toEqual(edited);
  });

  it("rejects an editor runtime outside the managed PuppyOne origin boundary", async () => {
    await writeFile(path.join(root, "slides.pptx"), Buffer.from("slides"));
    const fixture = createService({
      edited: Buffer.from("edited"),
      apiScriptUrl: "https://attacker.example/web-apps/apps/api/documents/api.js",
    });

    await expect(fixture.service.createSession({
      ownerId: 19,
      rootPath: root,
      relativePath: "slides.pptx",
      locale: "en",
    })).rejects.toThrow(/not allowed/i);
    expect(fixture.surfaceManager.attach).not.toHaveBeenCalled();
  });
});

function createService({
  edited,
  states = [],
  noteInternalWrite = vi.fn(),
  apiScriptUrl = "https://office.puppyone.ai/web-apps/apps/api/documents/api.js",
}) {
  const remote = { status: "ready", resultRevision: 0, deleted: false };
  const upload = {};
  const requestSessionApi = vi.fn(async (_apiBase, apiPath, init) => {
    if (apiPath === "/office/sessions" && init.method === "POST") {
      const uploadedFile = init.body.get("file");
      upload.locale = init.body.get("locale");
      upload.filename = uploadedFile.name;
      upload.bytes = Buffer.from(await uploadedFile.arrayBuffer());
      return {
        session_id: SESSION_ID,
        status: "ready",
        result_revision: 0,
        api_script_url: apiScriptUrl,
        editor_config: {
          token: "backend-signed-config",
          document: { key: "backend-document-key" },
        },
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
    }
    if (apiPath === `/office/sessions/${SESSION_ID}/force-save`) {
      remote.status = "saved";
      remote.resultRevision = 1;
      return { accepted: true };
    }
    if (apiPath === `/office/sessions/${SESSION_ID}` && init.method === "GET") {
      return {
        session_id: SESSION_ID,
        status: remote.status,
        result_revision: remote.resultRevision,
        message: null,
      };
    }
    if (apiPath === `/office/sessions/${SESSION_ID}/result?revision=1`) {
      return new Uint8Array(edited);
    }
    if (apiPath === `/office/sessions/${SESSION_ID}` && init.method === "DELETE") {
      remote.deleted = true;
      return { closed: true };
    }
    throw new Error(`Unexpected managed Office request: ${init.method} ${apiPath}`);
  });
  const ownerWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (_channel, state) => states.push(state),
    },
  };
  const surfaceManager = {
    attach: vi.fn(async () => ({ surfaceId: "test-office-surface", attached: true })),
    setBounds: vi.fn(() => ({ ok: true, visible: true })),
    detach: vi.fn(() => ({ detached: true })),
    destroyOwner: vi.fn(),
    destroyAll: vi.fn(),
  };
  const service = createOfficeEditingService({
    apiBaseUrl: API_BASE,
    cloudAuthService: { requestSessionApi },
    recoveryRoot,
    readWorkspaceBinaryFileVersion,
    writeWorkspaceBinaryFile,
    absorbWorkspaceEditReviewPath: vi.fn(async () => undefined),
    workspaceWatchService: { noteInternalWrite },
    getOwnerWindow: () => ownerWindow,
    surfaceManager,
    logger: { warn: vi.fn() },
  });
  services.push(service);
  return { service, requestSessionApi, surfaceManager, upload, remote };
}

async function attachTestSurface(service, sessionId, ownerId) {
  await service.attachSurface({
    ownerId,
    sessionId,
    attachmentId: "test-attachment",
    bounds: { x: 0, y: 0, width: 800, height: 600 },
  });
}

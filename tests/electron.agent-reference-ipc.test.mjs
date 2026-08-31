import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentAttachmentStore } from "../electron/main/agent/agent-attachment-store.mjs";
import { registerAgentIpcHandlers } from "../electron/main/ipc/agent-ipc.mjs";

const temporaryRoots = [];

afterEach(async () => Promise.all(temporaryRoots.splice(0).map((root) => (
  fs.promises.rm(root, { recursive: true, force: true })
))));

describe("Agent reference IPC authorization", () => {
  it("turns a preload file grant into an owner-bound, one-use snapshot", async () => {
    const root = await temporaryRoot();
    const workspace = path.join(root, "workspace");
    const source = path.join(root, "outside.txt");
    await fs.promises.mkdir(workspace);
    await fs.promises.writeFile(source, "immutable input");
    const store = createAgentAttachmentStore({ rootPath: path.join(root, "staging") });
    let adapterInput = "";
    const startTurn = vi.fn(async (_owner, request) => {
      adapterInput = await fs.promises.readFile(request.references[0].path, "utf8");
      return { sessionId: "session-1", turnId: "turn-1" };
    });
    const handlers = registerHandlers({ workspace, store, startTurn });
    const owner = { sender: { id: 7 } };

    const [draft] = await handlers.get("agent:reference-stage")(owner, {
      rootPath: workspace,
      epoch: "draft-a",
      sourcePaths: [source],
    });
    expect(draft).toMatchObject({ kind: "staged-attachment", status: "ready" });
    expect(draft).not.toHaveProperty("path");
    expect(JSON.stringify(draft)).not.toContain(source);

    await handlers.get("agent:turn-start")(owner, {
      rootPath: workspace,
      sessionId: "session-1",
      prompt: "use @outside.txt",
      promptMentions: [{ referenceId: draft.id, start: 4, end: 16 }],
      referenceEpoch: "draft-a",
      references: [draft],
    });
    const authorized = startTurn.mock.calls[0][1].references[0];
    expect(authorized).toMatchObject({ authorized: true, kind: "staged-attachment", name: "outside.txt" });
    expect(authorized.path).not.toBe(source);
    expect(startTurn.mock.calls[0][1].promptMentions).toEqual([
      { referenceId: draft.id, start: 4, end: 16 },
    ]);
    expect(adapterInput).toBe("immutable input");
    await expect(fs.promises.stat(authorized.path)).resolves.toBeDefined();

    await expect(handlers.get("agent:turn-start")(owner, {
      rootPath: workspace,
      sessionId: "session-1",
      prompt: "replay grant",
      referenceEpoch: "draft-a",
      references: [draft],
    })).rejects.toThrow(/in use|leased|invalid/i);
    await store.revokeOwner(owner.sender.id);
    await expect(fs.promises.stat(authorized.path)).rejects.toThrow();
    await store.close();
  });

  it("rejects cross-window grants and raw external workspace paths", async () => {
    const root = await temporaryRoot();
    const workspace = path.join(root, "workspace");
    const source = path.join(root, "external.txt");
    await fs.promises.mkdir(workspace);
    await fs.promises.writeFile(source, "external");
    await fs.promises.writeFile(path.join(workspace, "inside.txt"), "inside");
    const store = createAgentAttachmentStore({ rootPath: path.join(root, "staging") });
    const handlers = registerHandlers({ workspace, store, startTurn: vi.fn(async () => ({ accepted: true })) });
    const [draft] = await handlers.get("agent:reference-stage")({ sender: { id: 11 } }, {
      rootPath: workspace,
      epoch: "draft-owner",
      sourcePaths: [source],
    });
    const [workspaceDraft] = await handlers.get("agent:reference-resolve-workspace")({ sender: { id: 11 } }, {
      rootPath: workspace,
      paths: ["inside.txt"],
    });
    expect(workspaceDraft).toMatchObject({ path: "inside.txt", relativePath: "inside.txt", status: "ready" });
    expect(workspaceDraft).not.toHaveProperty("authorized");
    expect(JSON.stringify(workspaceDraft)).not.toContain(workspace);

    await expect(handlers.get("agent:turn-start")({ sender: { id: 12 } }, {
      rootPath: workspace,
      sessionId: "session-1",
      prompt: "steal",
      referenceEpoch: "draft-owner",
      references: [draft],
    })).rejects.toThrow(/invalid|belongs/i);

    await expect(handlers.get("agent:turn-start")({ sender: { id: 11 } }, {
      rootPath: workspace,
      sessionId: "session-1",
      prompt: "raw path",
      references: [{
        id: "raw-external",
        kind: "workspace-entry",
        entryType: "file",
        path: source,
        relativePath: "external.txt",
        displayName: "external.txt",
        status: "ready",
      }],
    })).rejects.toThrow(/outside|workspace/i);
    await store.close();
  });

  it("keeps staged grants isolated when one window owns multiple workspaces", async () => {
    const root = await temporaryRoot();
    const workspaceA = path.join(root, "workspace-a");
    const workspaceB = path.join(root, "workspace-b");
    const source = path.join(root, "shared.md");
    await Promise.all([
      fs.promises.mkdir(workspaceA),
      fs.promises.mkdir(workspaceB),
      fs.promises.writeFile(source, "workspace-bound input"),
    ]);
    const store = createAgentAttachmentStore({ rootPath: path.join(root, "staging") });
    const owner = { sender: { id: 17 } };
    const handlersA = registerHandlers({ workspace: workspaceA, store, startTurn: vi.fn() });
    const handlersB = registerHandlers({ workspace: workspaceB, store, startTurn: vi.fn() });
    const [draft] = await handlersA.get("agent:reference-stage")(owner, {
      rootPath: workspaceA,
      epoch: "workspace-a-draft",
      sourcePaths: [source],
    });

    await expect(handlersB.get("agent:turn-start")(owner, {
      rootPath: workspaceB,
      sessionId: "session-b",
      prompt: "cross workspace",
      referenceEpoch: "workspace-a-draft",
      references: [draft],
    })).rejects.toThrow(/invalid|belongs|workspace/i);
    await store.close();
  });

  it("releases a failed turn lease so the unchanged draft can retry", async () => {
    const root = await temporaryRoot();
    const workspace = path.join(root, "workspace");
    const source = path.join(root, "retry.txt");
    await fs.promises.mkdir(workspace);
    await fs.promises.writeFile(source, "retry");
    const store = createAgentAttachmentStore({ rootPath: path.join(root, "staging") });
    const startTurn = vi.fn()
      .mockRejectedValueOnce(new Error("native start failed"))
      .mockResolvedValueOnce({ sessionId: "session-1", turnId: "turn-2" });
    const handlers = registerHandlers({ workspace, store, startTurn });
    const owner = { sender: { id: 21 } };
    const [draft] = await handlers.get("agent:reference-stage")(owner, {
      rootPath: workspace,
      epoch: "retry-draft",
      sourcePaths: [source],
    });
    const request = {
      rootPath: workspace,
      sessionId: "session-1",
      prompt: "retry",
      referenceEpoch: "retry-draft",
      references: [draft],
    };
    await expect(handlers.get("agent:turn-start")(owner, request)).rejects.toThrow(/native start failed/i);
    await expect(handlers.get("agent:turn-start")(owner, request)).resolves.toMatchObject({ turnId: "turn-2" });
    expect(startTurn).toHaveBeenCalledTimes(2);
    await store.close();
  });
});

function registerHandlers({ workspace, store, startTurn }) {
  const handlers = new Map();
  registerAgentIpcHandlers({
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    agentService: { startTurn, getReferenceInputCapabilities: () => ({
      schemaVersion: 1,
      workspace: { files: true, directories: true },
      attachments: {
        image: { accepted: true },
        text: { accepted: true },
        audio: { accepted: true },
        video: { accepted: true },
        binary: { accepted: true },
      },
      limits: {
        maxCount: 32,
        maxBytesPerReference: 25 * 1024 * 1024,
        maxTotalBytes: 25 * 1024 * 1024,
      },
      steer: false,
      attachmentOnly: false,
    }) },
    localAgentInventory: {},
    attachmentStore: store,
    authorizeWorkspaceRoot: async (_event, requested) => {
      if (requested !== workspace) throw new Error("Workspace mismatch");
      return workspace;
    },
  });
  return handlers;
}

async function temporaryRoot() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-ipc-"));
  temporaryRoots.push(root);
  return root;
}

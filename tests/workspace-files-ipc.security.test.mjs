import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceFileIpcHandlers } from "../electron/main/ipc/workspace-files-ipc.mjs";
import { createLocalFileCapabilityStore } from "../electron/main/local-file-capabilities.mjs";
import { parseLocalFileUrl } from "../electron/main/local-file-protocol.mjs";
import { createSenderWorkspaceAuthorization } from "../electron/main/workspace-authorization.mjs";

let root;
let otherRoot;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "puppyone-ipc-root-"));
  otherRoot = await mkdtemp(path.join(os.tmpdir(), "puppyone-ipc-other-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(otherRoot, { recursive: true, force: true });
});

describe("workspace file IPC authorization", () => {
  it("rejects a spoofed renderer root for every workspace file handler", async () => {
    const { handlers } = createHarness(() => root);
    const event = { sender: { id: 7 } };
    const requests = new Map([
      ["workspace:list-folder-children", { rootPath: otherRoot, folderPath: null }],
      ["workspace:read-file", { rootPath: otherRoot, path: "secret.txt" }],
      ["workspace:get-file-url", { rootPath: otherRoot, path: "secret.txt" }],
      ["workspace:convert-office-docx", { rootPath: otherRoot, path: "secret.rtf" }],
      ["workspace:write-file", { rootPath: otherRoot, path: "secret.txt", content: "changed" }],
      ["workspace:create-entry", { rootPath: otherRoot, parentPath: null, name: "new.txt", kind: "file" }],
      ["workspace:rename-entry", { rootPath: otherRoot, path: "secret.txt", nextName: "renamed.txt" }],
      ["workspace:move-entry", { rootPath: otherRoot, fromPath: "secret.txt", toPath: "moved.txt" }],
      ["workspace:copy-entry", { rootPath: otherRoot, fromPath: "secret.txt", targetFolderPath: null }],
      ["workspace:import-entries", { rootPath: otherRoot, sourcePaths: [path.join(otherRoot, "secret.txt")], targetFolderPath: null }],
      ["workspace:delete-entry", { rootPath: otherRoot, path: "secret.txt" }],
      ["workspace:reveal-entry-in-finder", { rootPath: otherRoot, path: "secret.txt" }],
      ["workspace:open-entry-external", { rootPath: otherRoot, path: "secret.txt" }],
      ["workspace:resolve-external-open-target", { rootPath: otherRoot, path: "secret.txt" }],
      ["workspace:list-external-open-targets", { rootPath: otherRoot, path: "secret.txt" }],
    ]);

    await writeFile(path.join(otherRoot, "secret.txt"), "secret");
    for (const [channel, request] of requests) {
      await expect(handlers.get(channel)(event, request)).rejects.toThrow(/does not match the workspace assigned/i);
    }

    expect(await readFile(path.join(otherRoot, "secret.txt"), "utf8")).toBe("secret");
    await expect(readFile(path.join(otherRoot, "new.txt"), "utf8")).rejects.toThrow();
  });

  it("uses the sender workspace and accepts a renderer root that resolves to the same directory", async () => {
    const { handlers } = createHarness(() => root);
    const event = { sender: { id: 8 } };
    const notePath = path.join(root, "note.txt");
    await writeFile(notePath, "inside");

    const direct = await handlers.get("workspace:read-file")(event, { rootPath: root, path: "note.txt" });
    expect(direct.content).toBe("inside");

    const aliasParent = await mkdtemp(path.join(os.tmpdir(), "puppyone-ipc-alias-"));
    const aliasPath = path.join(aliasParent, "workspace");
    try {
      await symlink(root, aliasPath, "dir");
      const throughAlias = await handlers.get("workspace:read-file")(event, {
        rootPath: aliasPath,
        path: "note.txt",
      });
      expect(throughAlias.content).toBe("inside");
    } finally {
      await rm(aliasParent, { recursive: true, force: true });
    }
  });

  it("issues a sender-owned URL capability scoped to the exact file", async () => {
    const { handlers, localFileCapabilities } = createHarness(() => root);
    await writeFile(path.join(root, "note.txt"), "inside");
    const result = await handlers.get("workspace:get-file-url")(
      { sender: { id: 81 } },
      { rootPath: root, path: "note.txt" },
    );
    const parsed = parseLocalFileUrl(result.url);

    expect(parsed.requestPath).toBe("note.txt");
    expect(localFileCapabilities.resolve(parsed)).toEqual({
      rootPath: await fs.promises.realpath(root),
      relativePath: "note.txt",
    });
    expect(localFileCapabilities.resolve({ ...parsed, requestPath: "other.txt" })).toBeNull();
  });

  it("issues unique Markdown asset leases and only their sender can revoke them", async () => {
    const { handlers, localFileCapabilities } = createHarness(() => root);
    await writeFile(path.join(root, "image.png"), "png");
    const owner = { sender: { id: 82 } };
    const request = { rootPath: root, path: "image.png", purpose: "markdown-asset" };
    const first = await handlers.get("workspace:get-file-url")(owner, request);
    const second = await handlers.get("workspace:get-file-url")(owner, request);
    const parsed = parseLocalFileUrl(first.url);

    expect(second.url).not.toBe(first.url);
    expect(parsed.purpose).toBe("markdown-asset");
    expect(localFileCapabilities.resolve(parsed)).toEqual({
      rootPath: await fs.promises.realpath(root),
      relativePath: "image.png",
    });
    await expect(handlers.get("workspace:revoke-file-url")(
      { sender: { id: 83 } },
      { url: first.url },
    )).resolves.toEqual({ revoked: false });
    await expect(handlers.get("workspace:revoke-file-url")(
      owner,
      { url: first.url },
    )).resolves.toEqual({ revoked: true });
    expect(localFileCapabilities.resolve(parsed)).toBeNull();
    expect(localFileCapabilities.resolve(parseLocalFileUrl(second.url))).toEqual({
      rootPath: await fs.promises.realpath(root),
      relativePath: "image.png",
    });
  });

  it("rejects local file operations when the sender has no local workspace", async () => {
    const { handlers } = createHarness(() => null);
    await expect(handlers.get("workspace:read-file")(
      { sender: { id: 9 } },
      { rootPath: root, path: "note.txt" },
    )).rejects.toThrow(/no local workspace is assigned/i);
  });

  it("rejects direct symbolic-link access before revealing or reading the target", async () => {
    const { handlers, shell } = createHarness(() => root);
    const externalFile = path.join(otherRoot, "secret.txt");
    const linkedFile = path.join(root, "linked.txt");
    await writeFile(externalFile, "secret");
    await symlink(externalFile, linkedFile);

    const event = { sender: { id: 10 } };
    await expect(handlers.get("workspace:read-file")(
      event,
      { rootPath: root, path: "linked.txt" },
    )).rejects.toThrow(/symbolic links/i);
    await expect(handlers.get("workspace:reveal-entry-in-finder")(
      event,
      { rootPath: root, path: "linked.txt" },
    )).rejects.toThrow(/symbolic links/i);
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("copies only inside the sender-authorized workspace", async () => {
    const { handlers } = createHarness(() => root);
    await writeFile(path.join(root, "source.txt"), "inside");

    await expect(handlers.get("workspace:copy-entry")(
      { sender: { id: 101 } },
      { rootPath: root, fromPath: "source.txt", targetFolderPath: null },
    )).resolves.toEqual({ path: "source copy.txt" });
    expect(await readFile(path.join(root, "source copy.txt"), "utf8")).toBe("inside");
  });

  it("cannot bypass executable confirmation and revalidates after the dialog", async () => {
    const executablePath = path.join(root, "run.cmd");
    const externalFile = path.join(otherRoot, "replacement.cmd");
    await writeFile(executablePath, "echo safe");
    await writeFile(externalFile, "echo outside");
    const dialog = {
      showMessageBox: vi.fn(async () => {
        await rm(executablePath, { force: true });
        await symlink(externalFile, executablePath);
        return { response: 0 };
      }),
    };
    const { handlers, shell } = createHarness(() => root, { dialog });

    await expect(handlers.get("workspace:open-entry-external")(
      { sender: { id: 11 } },
      {
        rootPath: root,
        path: "run.cmd",
        // A forged or legacy renderer payload must not disable the main-process policy.
        confirmExecutableFiles: false,
      },
    )).rejects.toThrow(/symbolic links/i);
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  it("cancels an in-flight Office conversion and removes the completed session", async () => {
    const convertOfficeDocument = createAbortableOfficeConverter();
    const { handlers } = createHarness(() => root, { convertOfficeDocument });
    const event = { sender: { id: 21 } };
    const startPromise = handlers.get("workspace:convert-office-docx")(event, {
      rootPath: root,
      path: "sample.rtf",
      requestId: "conversion-1",
    });
    const startResult = startPromise.catch((error) => error);
    await vi.waitFor(() => expect(convertOfficeDocument).toHaveBeenCalledOnce());

    await expect(handlers.get("workspace:convert-office-docx-cancel")(event, {
      requestId: "conversion-1",
    })).resolves.toEqual({ cancelled: true });
    expect(await startResult).toMatchObject({ message: "Office conversion was cancelled." });
    await expect(handlers.get("workspace:convert-office-docx-cancel")(event, {
      requestId: "conversion-1",
    })).resolves.toEqual({ cancelled: false });
  });

  it("does not let another renderer cancel an Office conversion", async () => {
    const convertOfficeDocument = createAbortableOfficeConverter();
    const { handlers } = createHarness(() => root, { convertOfficeDocument });
    const ownerEvent = { sender: { id: 22 } };
    const otherEvent = { sender: { id: 23 } };
    const startPromise = handlers.get("workspace:convert-office-docx")(ownerEvent, {
      rootPath: root,
      path: "sample.rtf",
      requestId: "shared-request-id",
    });
    const startResult = startPromise.catch((error) => error);
    await vi.waitFor(() => expect(convertOfficeDocument).toHaveBeenCalledOnce());

    await expect(handlers.get("workspace:convert-office-docx-cancel")(otherEvent, {
      requestId: "shared-request-id",
    })).resolves.toEqual({ cancelled: false });
    expect(convertOfficeDocument.mock.calls[0][2].signal.aborted).toBe(false);

    await handlers.get("workspace:convert-office-docx-cancel")(ownerEvent, {
      requestId: "shared-request-id",
    });
    expect(await startResult).toMatchObject({ message: "Office conversion was cancelled." });
  });

  it("cleans up successful conversions and enforces the per-window concurrency limit", async () => {
    const successfulConverter = vi.fn(async () => ({ bytes: Buffer.from("docx"), warnings: [] }));
    const successfulHarness = createHarness(() => root, { convertOfficeDocument: successfulConverter });
    const successEvent = { sender: { id: 24 } };
    await expect(successfulHarness.handlers.get("workspace:convert-office-docx")(successEvent, {
      rootPath: root,
      path: "sample.rtf",
      requestId: "success-1",
    })).resolves.toEqual({ bytes: Buffer.from("docx"), warnings: [] });
    await expect(successfulHarness.handlers.get("workspace:convert-office-docx-cancel")(successEvent, {
      requestId: "success-1",
    })).resolves.toEqual({ cancelled: false });

    const pendingConverter = createAbortableOfficeConverter();
    const { handlers } = createHarness(() => root, { convertOfficeDocument: pendingConverter });
    const event = { sender: { id: 25 } };
    const firstResult = handlers.get("workspace:convert-office-docx")(event, {
      rootPath: root,
      path: "one.rtf",
      requestId: "limit-1",
    }).catch((error) => error);
    const secondResult = handlers.get("workspace:convert-office-docx")(event, {
      rootPath: root,
      path: "two.rtf",
      requestId: "limit-2",
    }).catch((error) => error);
    await vi.waitFor(() => expect(pendingConverter).toHaveBeenCalledTimes(2));

    await expect(handlers.get("workspace:convert-office-docx")(event, {
      rootPath: root,
      path: "three.rtf",
      requestId: "limit-3",
    })).rejects.toThrow(/only 2 Office conversions/i);

    await handlers.get("workspace:convert-office-docx-cancel")(event, { requestId: "limit-1" });
    await handlers.get("workspace:convert-office-docx-cancel")(event, { requestId: "limit-2" });
    expect(await firstResult).toMatchObject({ message: "Office conversion was cancelled." });
    expect(await secondResult).toMatchObject({ message: "Office conversion was cancelled." });
  });

  it("aborts and cleans up Office conversions when their renderer is destroyed", async () => {
    const convertOfficeDocument = createAbortableOfficeConverter();
    const { handlers } = createHarness(() => root, { convertOfficeDocument });
    const sender = new EventEmitter();
    sender.id = 26;
    const event = { sender };
    const startResult = handlers.get("workspace:convert-office-docx")(event, {
      rootPath: root,
      path: "window-close.rtf",
      requestId: "window-close-1",
    }).catch((error) => error);
    await vi.waitFor(() => expect(convertOfficeDocument).toHaveBeenCalledOnce());

    sender.emit("destroyed");
    expect(await startResult).toMatchObject({ message: "Office conversion was cancelled." });
    await expect(handlers.get("workspace:convert-office-docx-cancel")(event, {
      requestId: "window-close-1",
    })).resolves.toEqual({ cancelled: false });
    expect(sender.listenerCount("destroyed")).toBe(0);
  });
});

function createHarness(getWorkspaceRootForSender, { convertOfficeDocument, dialog } = {}) {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
  };
  const shell = {
    showItemInFolder: vi.fn(),
    openPath: vi.fn(async () => ""),
  };
  const localFileCapabilities = createLocalFileCapabilityStore();

  registerWorkspaceFileIpcHandlers({
    app: {},
    ipcMain,
    BrowserWindow: { fromWebContents: () => null },
    dialog: dialog ?? { showMessageBox: vi.fn(async () => ({ response: 1 })) },
    fs,
    shell,
    authorizeWorkspaceRoot: createSenderWorkspaceAuthorization({
      getWorkspaceRootForSender,
      fsModule: fs,
    }),
    localFileCapabilities,
    convertOfficeDocument,
  });

  return { handlers, shell, localFileCapabilities };
}

function createAbortableOfficeConverter() {
  return vi.fn((_rootPath, _filePath, { signal }) => new Promise((_resolve, reject) => {
    const rejectCancelled = () => reject(new Error("Office conversion was cancelled."));
    if (signal.aborted) {
      rejectCancelled();
      return;
    }
    signal.addEventListener("abort", rejectCancelled, { once: true });
  }));
}

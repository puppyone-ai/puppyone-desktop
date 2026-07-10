import { describe, expect, it } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createViewerPackResourceBroker,
  ResourceBrokerError,
} from "../../electron/main/viewer-packs/resource-broker.mjs";
import { handleResourceRequest } from "../../electron/main/viewer-packs/resource-protocol.mjs";
import {
  statWorkspaceFile,
  readWorkspaceFileRange,
  RESOURCE_MAX_RANGE_READ_BYTES,
} from "../../local-api/workspace.mjs";

async function makeWorkspaceWithFile(sizeBytes, contents) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "vp-ws-"));
  const relativePath = "big.bin";
  const absolutePath = path.join(root, relativePath);
  if (contents) {
    await fsp.writeFile(absolutePath, contents);
  } else {
    const handle = await fsp.open(absolutePath, "w");
    try {
      if (sizeBytes > 0) await handle.truncate(sizeBytes);
    } finally {
      await handle.close();
    }
  }
  return { root, relativePath, absolutePath };
}

describe("viewer pack resource broker", () => {
  it("serves bounded ranges and rejects oversized / unsatisfiable ranges", async () => {
    const payload = Buffer.from("abcdefghijklmnopqrstuvwxyz");
    const { root, relativePath, absolutePath } = await makeWorkspaceWithFile(payload.length, payload);
    const broker = createViewerPackResourceBroker({
      resolveAuthorizedFilePath: async () => ({ absolutePath, rootPath: root, relativePath }),
    });

    const opened = await broker.openForDocument({
      pluginId: "ai.puppyone.viewer.glb",
      instanceId: "inst-1",
      ownerWebContentsId: 7,
      documentPath: relativePath,
      documentRevision: "1",
      rootPath: root,
      relativePath,
    });

    const slice = await broker.readRange({
      handle: opened.handle,
      offset: 0,
      length: 4,
      pluginId: "ai.puppyone.viewer.glb",
      instanceId: "inst-1",
      ownerWebContentsId: 7,
    });
    expect(Buffer.from(slice.bytes).toString("utf8")).toBe("abcd");

    await expect(broker.readRange({
      handle: opened.handle,
      offset: 0,
      length: RESOURCE_MAX_RANGE_READ_BYTES + 1,
      pluginId: "ai.puppyone.viewer.glb",
      instanceId: "inst-1",
      ownerWebContentsId: 7,
    })).rejects.toBeInstanceOf(ResourceBrokerError);

    await expect(broker.readRange({
      handle: opened.handle,
      offset: payload.length,
      length: 1,
      pluginId: "ai.puppyone.viewer.glb",
      instanceId: "inst-1",
      ownerWebContentsId: 7,
    })).rejects.toMatchObject({ code: "range-not-satisfiable" });

    const protocolResult = await handleResourceRequest({
      request: new Request(`puppyone-resource://handle/${opened.handle}`, {
        headers: { range: "bytes=1-3" },
      }),
      broker,
      audience: {
        pluginId: "ai.puppyone.viewer.glb",
        instanceId: "inst-1",
        ownerWebContentsId: 7,
      },
    });
    expect(protocolResult.status).toBe(206);
    expect(protocolResult.headers.get("Content-Range")).toBe("bytes 1-3/26");

    broker.revokeInstance("inst-1");
    await expect(broker.readRange({
      handle: opened.handle,
      offset: 0,
      length: 1,
      pluginId: "ai.puppyone.viewer.glb",
      instanceId: "inst-1",
      ownerWebContentsId: 7,
    })).rejects.toMatchObject({ code: "revoked" });
  });

  it("allows metadata + bounded range for files larger than 100 MiB", async () => {
    const size = 120 * 1024 * 1024;
    const { root, relativePath } = await makeWorkspaceWithFile(size);
    const meta = await statWorkspaceFile(root, relativePath);
    expect(meta.size).toBe(size);

    const range = await readWorkspaceFileRange(root, relativePath, {
      start: 0,
      end: 15,
    });
    expect(range.unsatisfiable).toBe(false);
    expect(range.bytes.length).toBe(16);
    expect(range.size).toBe(size);
  }, 60_000);
});

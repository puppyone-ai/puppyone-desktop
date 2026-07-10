import { describe, expect, it } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { createViewerPackStore } from "../../electron/main/viewer-packs/store.mjs";
import { createViewerPackPackageService } from "../../electron/main/viewer-packs/package-service.mjs";
import { createViewerPackRegistryService } from "../../electron/main/viewer-packs/registry-service.mjs";
import {
  generateTestKeyPair,
  signPayload,
  sha256Hex,
} from "../../electron/main/viewer-packs/package-signature.mjs";
import { extractAndValidateViewerPackArchive } from "../../electron/main/viewer-packs/archive-validator.mjs";

const manifest = {
  schemaVersion: 1,
  id: "ai.puppyone.viewer.glb",
  publisher: "puppyone",
  version: "1.0.0",
  engines: { puppyone: ">=0.2.0", viewerApi: "1" },
  viewer: {
    entry: "viewer.html",
    source: "range-resource",
    sources: ["local"],
    runtime: ["worker"],
  },
  formats: [
    {
      id: "glb",
      label: "glTF Binary Scene",
      extensions: [".glb"],
      mimeTypes: ["model/gltf-binary"],
      category: "binary",
      defaultViewer: "plugin:ai.puppyone.viewer.glb",
      editable: false,
    },
  ],
  permissions: {
    currentDocument: ["metadata", "readRange"],
    relatedFiles: "none",
    network: [],
  },
};

async function buildArchive(files) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("viewer pack package install", () => {
  it("rejects unsigned packages", async () => {
    const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), "vp-unsigned-"));
    const store = createViewerPackStore({ userDataPath });
    const packages = createViewerPackPackageService({
      store,
      getPublicKeys: () => [],
    });
    const archiveBytes = await buildArchive({
      "manifest.json": JSON.stringify(manifest),
      "viewer.html": "<html></html>",
    });
    await expect(packages.installFromBytes({
      archiveBytes,
      signatureBase64Url: "not-a-signature",
    })).rejects.toThrow(/signature|pinned/i);
  });

  it("rejects path traversal entries", async () => {
    const archiveBytes = await fsp.readFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../fixtures/viewer-packs/traversal.puppyplugin",
      ),
    );
    const destinationDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vp-trav-"));
    await expect(extractAndValidateViewerPackArchive({
      archiveBytes,
      destinationDir,
    })).rejects.toThrow(/rejected|escape|traversal/i);
  });

  it("rejects absolute archive entry paths", async () => {
    const archiveBytes = await buildArchive({
      "manifest.json": JSON.stringify(manifest),
      "/tmp/escape.html": "nope",
      "viewer.html": "<html></html>",
    });
    const destinationDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vp-abs-"));
    await expect(extractAndValidateViewerPackArchive({
      archiveBytes,
      destinationDir,
    })).rejects.toThrow(/rejected|absolute|escape/i);
  });

  it("atomically installs a signed package and publishes a snapshot", async () => {
    const userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), "vp-install-"));
    const keys = generateTestKeyPair();
    const store = createViewerPackStore({ userDataPath });
    const packages = createViewerPackPackageService({
      store,
      getPublicKeys: () => [keys.publicKeyPem],
    });
    const registry = createViewerPackRegistryService({ store });

    const archiveBytes = await buildArchive({
      "manifest.json": JSON.stringify(manifest),
      "viewer.html": "<!doctype html><title>glb</title>",
    });
    const signatureBase64Url = signPayload(keys.privateKeyPem, archiveBytes);
    const result = await packages.installFromBytes({
      archiveBytes,
      signatureBase64Url,
      expectedSha256: sha256Hex(archiveBytes),
    });

    expect(result.pluginId).toBe("ai.puppyone.viewer.glb");
    const snapshot = await registry.getContributionSnapshot();
    expect(snapshot.contributions).toHaveLength(1);
    expect(snapshot.contributions[0].label).toBe("glTF Binary Scene");
    expect(snapshot.contributions[0].contentHash).toBe(result.contentHash);

    const resolved = await registry.resolvePackageFile({
      pluginId: result.pluginId,
      contentHash: result.contentHash,
      relativePath: "viewer.html",
    });
    expect(resolved.absolutePath.includes(path.join("packages", result.pluginId, result.version))).toBe(true);

    await expect(registry.resolvePackageFile({
      pluginId: result.pluginId,
      contentHash: "deadbeef",
      relativePath: "viewer.html",
    })).rejects.toThrow(/hash/i);

    await packages.disable(result.pluginId);
    registry.invalidate();
    const afterDisable = await registry.getContributionSnapshot({ force: true });
    expect(afterDisable.contributions).toHaveLength(0);
  });
});

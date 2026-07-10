import { describe, expect, it } from "vitest";
import { validateViewerPackManifest, isReservedCoreViewerId } from "../../electron/main/viewer-packs/manifest-schema.mjs";

const validManifest = {
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

describe("viewer pack manifest schema", () => {
  it("accepts a valid first-party glb manifest", () => {
    const result = validateViewerPackManifest(validManifest);
    expect(result.ok).toBe(true);
    expect(result.value.id).toBe("ai.puppyone.viewer.glb");
    expect(result.value.permissions.network).toEqual([]);
  });

  it("rejects network permissions in v1", () => {
    const result = validateViewerPackManifest({
      ...validManifest,
      permissions: {
        ...validManifest.permissions,
        network: ["https://example.com"],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("permissions.network-must-be-empty-v1");
  });

  it("rejects unknown permission keys", () => {
    const result = validateViewerPackManifest({
      ...validManifest,
      permissions: {
        ...validManifest.permissions,
        filesystem: "all",
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("permissions-unknown-keys");
  });

  it("rejects reserved core viewer ids", () => {
    expect(isReservedCoreViewerId("markdown")).toBe(true);
    const result = validateViewerPackManifest({
      ...validManifest,
      formats: [
        {
          ...validManifest.formats[0],
          defaultViewer: "plugin:markdown",
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("formats[0].defaultViewer-reserved-core-id");
  });

  it("rejects traversal in viewer.entry", () => {
    const result = validateViewerPackManifest({
      ...validManifest,
      viewer: {
        ...validManifest.viewer,
        entry: "../escape.html",
      },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects startup activation events", () => {
    const result = validateViewerPackManifest({
      ...validManifest,
      activationEvents: ["onStartup"],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("activationEvents-startup-forbidden");
  });
});

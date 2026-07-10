import { describe, expect, it } from "vitest";
import { resolveFileFormat } from "../vendor/shared-ui/src/core/fileFormats";
import {
  createPresetViewerRegistry,
  definePresetViewer,
  PRESET_VIEWER_REGISTRY,
  PRESET_VIEWERS,
  resolveEditorViewer,
} from "../vendor/shared-ui/src/editor/viewerRegistry";
import { PRESET_VIEWER_CONTRACT_VERSION } from "../vendor/shared-ui/src/editor/viewerContract";
import type {
  EditorDocument,
  EditorViewerMatch,
  PresetViewerContribution,
} from "../vendor/shared-ui/src/editor/viewerTypes";

function document(name: string, type = "file", mimeType: string | null = null): EditorDocument {
  return { path: name, name, type, mimeType };
}

function matchFor(name: string): EditorViewerMatch {
  const input = document(name);
  return {
    document: input,
    format: resolveFileFormat({ name }),
    resolvedExtension: name.includes(".") ? name.split(".").pop() ?? null : null,
  };
}

function testContribution(
  id: string,
  match: PresetViewerContribution["match"],
): PresetViewerContribution {
  return {
    contractVersion: PRESET_VIEWER_CONTRACT_VERSION,
    id,
    capability: "preview",
    source: "content",
    runtime: "eager",
    match,
    render: () => null,
  };
}

const fallback = testContribution("test-placeholder", () => true) as PresetViewerContribution;
const validFallback: PresetViewerContribution = {
  ...fallback,
  capability: "placeholder",
  source: "none",
};

describe("preset viewer contribution contract", () => {
  it("publishes one immutable, versioned registry covering every source shape", () => {
    expect(Object.isFrozen(PRESET_VIEWER_REGISTRY)).toBe(true);
    expect(Object.isFrozen(PRESET_VIEWERS)).toBe(true);
    expect(new Set(PRESET_VIEWERS.map((viewer) => viewer.source))).toEqual(
      new Set(["content", "resource", "content-and-resource"]),
    );
    expect(PRESET_VIEWER_REGISTRY.fallback.source).toBe("none");
    expect(PRESET_VIEWERS.every((viewer) => (
      viewer.contractVersion === PRESET_VIEWER_CONTRACT_VERSION && Object.isFrozen(viewer)
    ))).toBe(true);
  });

  it.each([
    [document("notes.md"), "markdown", "content", "edit"],
    [document("settings.json", "text"), "json", "content", "edit"],
    [document("table.csv"), "csv-table", "content", "edit"],
    [document("page.html"), "html-artifact", "content-and-resource", "preview"],
    [document("photo.png"), "image-preview", "resource", "preview"],
    [document("report.pdf"), "pdf-preview", "resource", "preview"],
    [document("report.docx"), "office-preview", "resource", "preview"],
    [document("sound.mp3"), "audio-preview", "resource", "preview"],
    [document("movie.mp4"), "video-preview", "resource", "preview"],
    [document("source.ts"), "text", "content", "edit"],
    [document("scene.glb"), "document-placeholder", "none", "placeholder"],
  ])("routes %s through the deterministic preset order", (input, id, source, capability) => {
    expect(resolveEditorViewer(input).viewer).toMatchObject({ id, source, capability });
  });

  it("allows a new preset to be proven by registry contribution alone", () => {
    const custom = testContribution("test-viewer", ({ document: input }) => input.name === "sample.test-viewer");
    const registry = createPresetViewerRegistry([custom], validFallback);

    expect(registry.resolve(matchFor("sample.test-viewer")).id).toBe("test-viewer");
    expect(registry.resolve(matchFor("sample.unknown")).id).toBe("test-placeholder");
  });

  it("rejects unknown fields and unsupported authority values at runtime", () => {
    expect(() => definePresetViewer({
      ...testContribution("unknown-field", () => true),
      network: true,
    } as unknown as PresetViewerContribution)).toThrow(/unknown field/i);
    expect(() => definePresetViewer({
      ...testContribution("unknown-capability", () => true),
      capability: "execute",
    } as unknown as PresetViewerContribution)).toThrow(/unsupported capability/i);
    expect(() => definePresetViewer({
      ...testContribution("unknown-runtime", () => true),
      runtime: "worker",
    } as unknown as PresetViewerContribution)).toThrow(/unsupported runtime/i);
  });

  it("rejects duplicate ids and a dishonest fallback", () => {
    const duplicate = testContribution("duplicate", () => true);
    expect(() => createPresetViewerRegistry([duplicate, duplicate], validFallback)).toThrow(/more than once/i);
    expect(() => createPresetViewerRegistry([], fallback)).toThrow(/placeholder.*source 'none'/i);
  });
});

import { describe, expect, it } from "vitest";
import { requireSupportedAgentReferences } from "../electron/main/agent/application/agent-input-policy.mjs";

describe("Agent semantic reference admission policy", () => {
  const referenceInputs = {
    schemaVersion: 1,
    workspace: { files: true, directories: true },
    attachments: {
      image: { accepted: true, mimeTypes: ["image/png"], maxBytes: 512 },
      text: { accepted: true, mimeTypes: ["text/*"], maxBytes: 1_024 },
      audio: { accepted: false },
      video: { accepted: false },
      binary: { accepted: false },
    },
    limits: { maxCount: 4, maxBytesPerReference: 4_096, maxTotalBytes: 8_192 },
    steer: false,
    attachmentOnly: false,
  };

  it("admits references by semantic kind instead of native transport", () => {
    expect(() => requireSupportedAgentReferences({ referenceInputs }, [
      { kind: "workspace-entry", entryType: "file", size: 2_048 },
      { kind: "staged-attachment", name: "notes.md", mime: "text/markdown", size: 100 },
      { kind: "staged-attachment", name: "shot.png", mime: "image/png", size: 200 },
    ])).not.toThrow();
  });

  it("returns stable typed failures for unsupported kinds and native kind limits", () => {
    expect(() => requireSupportedAgentReferences({ referenceInputs }, [{
      kind: "staged-attachment",
      name: "paper.pdf",
      mime: "application/pdf",
      size: 100,
    }])).toThrow(expect.objectContaining({ code: "REFERENCE_KIND_UNSUPPORTED" }));
    expect(() => requireSupportedAgentReferences({ referenceInputs }, [{
      kind: "staged-attachment",
      name: "shot.png",
      mime: "image/png",
      size: 513,
    }])).toThrow(expect.objectContaining({ code: "REFERENCE_LIMIT_EXCEEDED" }));
    expect(() => requireSupportedAgentReferences({}, [{
      kind: "staged-attachment",
      name: "shot.png",
      mime: "image/png",
      size: 10,
    }])).toThrow(expect.objectContaining({ code: "REFERENCE_RUNTIME_CAPABILITY_MISSING" }));
  });
});

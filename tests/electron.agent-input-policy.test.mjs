import { describe, expect, it } from "vitest";
import {
  compileAgentPromptReferenceMentions,
  normalizePromptReferenceMentions,
  requireSupportedAgentReferences,
} from "../electron/main/agent/application/agent-input-policy.mjs";

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

  it("compiles only authenticated atomic mention ranges into native paths", () => {
    const references = [{
      authorized: true,
      id: "ref-notes",
      kind: "staged-attachment",
      path: "/private/snapshots/a.snapshot",
      displayName: "notes.md",
      mime: "text/markdown",
      size: 10,
    }];
    const prompt = "Review @notes.md and summarize it.";
    const mentions = normalizePromptReferenceMentions([
      { referenceId: "ref-notes", start: 7, end: 16 },
    ], prompt, references, () => "path");

    expect(compileAgentPromptReferenceMentions(prompt, mentions, references))
      .toBe("Review `/private/snapshots/a.snapshot` and summarize it.");
    expect(references[0].inlineMentioned).toBe(true);
  });

  it("keeps the display mention in prompt text when the Harness negotiated a resource block", () => {
    const references = [{
      id: "ref-resource",
      kind: "workspace-entry",
      path: "/workspace/notes.md",
      displayName: "notes.md",
      mime: "text/markdown",
    }];
    const prompt = "Review @notes.md";
    const mentions = normalizePromptReferenceMentions([
      { referenceId: "ref-resource", start: 7, end: 16 },
    ], prompt, references, () => "resource");

    expect(compileAgentPromptReferenceMentions(prompt, mentions, references)).toBe(prompt);
    expect(references[0]).toMatchObject({ inlineMentioned: true, mentionDelivery: "resource" });
  });

  it("rejects forged, overlapping, missing and image mention ranges", () => {
    const file = { id: "ref-a", path: "/workspace/a.md", displayName: "a.md", mime: "text/markdown" };
    expect(() => normalizePromptReferenceMentions([
      { referenceId: "ref-a", start: 0, end: 5 },
    ], "@other.md", [file])).toThrow(/does not match/i);
    expect(() => normalizePromptReferenceMentions([
      { referenceId: "missing", start: 0, end: 5 },
    ], "@a.md", [file])).toThrow(/not backed/i);
    expect(() => normalizePromptReferenceMentions([
      { referenceId: "ref-a", start: 0, end: 5 },
      { referenceId: "ref-a", start: 2, end: 5 },
    ], "@a.md", [file])).toThrow(/range/i);
    expect(() => normalizePromptReferenceMentions([
      { referenceId: "ref-image", start: 0, end: 10 },
    ], "@image.png", [{ ...file, id: "ref-image", displayName: "image.png", mime: "image/png" }]))
      .toThrow(/native media/i);
  });
});

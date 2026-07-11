import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  authorizeAgentReferences,
  agentReferenceLimits,
  createAgentReferenceBudget,
} from "../electron/main/agent/agent-reference-authorization.mjs";

const temporaryRoots = [];
afterEach(async () => Promise.all(temporaryRoots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true }))));

describe("Agent attachment and context authorization", () => {
  it("canonicalizes workspace files, deduplicates them, and derives renderer-independent metadata", async () => {
    const root = await temporaryRoot();
    const filename = path.join(root, "notes.md");
    await fs.promises.writeFile(filename, "hello");
    const result = await authorizeAgentReferences({ workspaceRoot: root, references: [{ path: filename }, filename] });
    expect(result).toEqual([{
      authorized: true,
      path: await fs.promises.realpath(filename),
      name: "notes.md",
      mime: "text/markdown",
      size: 5,
      snapshotUrl: "data:text/markdown;base64,aGVsbG8=",
    }]);
    expect(agentReferenceLimits.maxReferences).toBe(32);
    expect(agentReferenceLimits.maxTotalReferenceBytes).toBe(25 * 1024 * 1024);
  });

  it("fails closed for relative paths and symlinks escaping the workspace", async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    const secret = path.join(outside, "secret.txt");
    const link = path.join(root, "escape.txt");
    await fs.promises.writeFile(secret, "secret");
    await fs.promises.symlink(secret, link);
    await expect(authorizeAgentReferences({ workspaceRoot: root, references: [{ path: "relative.txt" }] })).rejects.toThrow(/absolute/i);
    await expect(authorizeAgentReferences({ workspaceRoot: root, references: [{ path: link }] })).rejects.toThrow(/inside the assigned workspace/i);
  });

  it("shares one byte and file-count budget across attachments and context", async () => {
    const root = await temporaryRoot();
    const attachment = path.join(root, "image.png");
    const context = path.join(root, "context.md");
    await fs.promises.writeFile(attachment, "image");
    await fs.promises.writeFile(context, "context");
    const budget = createAgentReferenceBudget();

    await authorizeAgentReferences({ workspaceRoot: root, references: [attachment], budget });
    await authorizeAgentReferences({ workspaceRoot: root, references: [context], budget });

    expect(budget).toEqual({
      remainingBytes: agentReferenceLimits.maxTotalReferenceBytes - 12,
      remainingReferences: agentReferenceLimits.maxReferences - 2,
    });
  });
});

async function temporaryRoot() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "puppyone-agent-reference-"));
  temporaryRoots.push(root);
  return root;
}

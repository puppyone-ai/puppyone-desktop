// Deep integration tests for the local-mode workspace engine (local-api/workspace.mjs).
// These exercise the real filesystem: every test runs against a fresh temp
// directory with real files, real folders, and real byte content — no mocks.
// This is the "端" (desktop/local) side of the product: create/read/write/rename/
// move/delete/import + the path-containment security boundaries.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat, symlink, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  workspaceFromPath,
  listFolderChildren,
  readWorkspaceFile,
  readWorkspaceTextFile,
  convertWorkspaceOfficeDocumentToDocx,
  writeWorkspaceTextFile,
  createWorkspaceEntry,
  renameWorkspaceEntry,
  moveWorkspaceEntry,
  deleteWorkspaceEntry,
  importWorkspaceEntries,
} from "../local-api/workspace.mjs";

let root;
let external;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "puppyone-ws-"));
  external = await mkdtemp(path.join(os.tmpdir(), "puppyone-ext-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(external, { recursive: true, force: true });
});

describe("workspaceFromPath", () => {
  it("returns identity for a real folder", async () => {
    const ws = await workspaceFromPath(root);
    expect(ws.path).toBe(path.resolve(root));
    expect(ws.name).toBe(path.basename(root));
    expect(ws.status).toBe("protected");
    expect(ws.cloudState).toBe("local");
    expect(ws.commitCount).toBe(0); // not a git repo yet
    expect(typeof ws.id).toBe("string");
  });

  it("is stable: same path -> same id", async () => {
    const a = await workspaceFromPath(root);
    const b = await workspaceFromPath(root);
    expect(a.id).toBe(b.id);
  });

  it("rejects a file path (not a folder)", async () => {
    const file = path.join(root, "note.txt");
    await writeFile(file, "hi");
    await expect(workspaceFromPath(file)).rejects.toThrow(/not a folder/i);
  });
});

describe("createWorkspaceEntry", () => {
  it("creates a file with exact byte content", async () => {
    const body = "# Title\n\nHello **world** — 你好\n";
    const res = await createWorkspaceEntry(root, { parentPath: null, name: "readme.md", kind: "file", content: body });
    expect(res.path).toBe("readme.md");
    const onDisk = await readFile(path.join(root, "readme.md"), "utf8");
    expect(onDisk).toBe(body);
  });

  it("creates an empty file when no content given", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "empty.txt", kind: "file" });
    expect(await readFile(path.join(root, "empty.txt"), "utf8")).toBe("");
  });

  it("creates a folder", async () => {
    const res = await createWorkspaceEntry(root, { parentPath: null, name: "src", kind: "folder" });
    expect(res.path).toBe("src");
    expect((await stat(path.join(root, "src"))).isDirectory()).toBe(true);
  });

  it("creates nested entries under a parent folder", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "docs", kind: "folder" });
    const res = await createWorkspaceEntry(root, { parentPath: "docs", name: "guide.md", kind: "file", content: "x" });
    expect(res.path).toBe("docs/guide.md");
    expect(await readFile(path.join(root, "docs", "guide.md"), "utf8")).toBe("x");
  });

  it("refuses to overwrite an existing file (wx flag)", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "a.txt", kind: "file", content: "1" });
    await expect(
      createWorkspaceEntry(root, { parentPath: null, name: "a.txt", kind: "file", content: "2" }),
    ).rejects.toThrow(/Unable to create file/i);
    expect(await readFile(path.join(root, "a.txt"), "utf8")).toBe("1");
  });

  it("rejects invalid entry names (slash, dotdot, absolute)", async () => {
    for (const name of ["../evil", "a/b", "..", ".", "/abs"]) {
      await expect(
        createWorkspaceEntry(root, { parentPath: null, name, kind: "file" }),
      ).rejects.toThrow();
    }
  });

  it("rejects an unknown kind", async () => {
    await expect(
      createWorkspaceEntry(root, { parentPath: null, name: "x", kind: "device" }),
    ).rejects.toThrow(/file or folder/i);
  });
});

describe("read / write round-trips", () => {
  it("reads back text content with metadata", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "note.md", kind: "file", content: "line1\nline2" });
    const file = await readWorkspaceTextFile(root, "note.md");
    expect(file.path).toBe("note.md");
    expect(file.name).toBe("note.md");
    expect(file.content).toBe("line1\nline2");
    expect(file.mimeType).toMatch(/text|markdown/i);
    expect(file.size).toBeTruthy();
  });

  it("updates content via writeWorkspaceTextFile", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "c.txt", kind: "file", content: "old" });
    await writeWorkspaceTextFile(root, "c.txt", "new content");
    expect((await readWorkspaceTextFile(root, "c.txt")).content).toBe("new content");
  });

  it("rejects non-string write content", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "c.txt", kind: "file", content: "x" });
    await expect(writeWorkspaceTextFile(root, "c.txt", 123)).rejects.toThrow(/must be text/i);
  });

  it("returns raw bytes via readWorkspaceFile", async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP magic
    await writeFile(path.join(root, "a.bin"), bytes);
    const out = await readWorkspaceFile(root, "a.bin");
    expect(Buffer.compare(out, bytes)).toBe(0);
  });

  it("returns partial bytes for puppyone-local Range reads", async () => {
    await writeFile(path.join(root, "letters.txt"), "abcdefghijklmnopqrstuvwxyz");
    const out = await readWorkspaceFile(root, "letters.txt", { rangeHeader: "bytes=2-5" });
    expect(out.partial).toBe(true);
    expect(out.start).toBe(2);
    expect(out.end).toBe(5);
    expect(out.size).toBe(26);
    expect(out.bytes.toString("utf8")).toBe("cdef");
  });

  it("readWorkspaceFile (puppyone-local protocol path) rejects a directory and traversal", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "dir", kind: "folder" });
    await expect(readWorkspaceFile(root, "dir")).rejects.toThrow(/folder/i);
    await expect(readWorkspaceFile(root, "../../etc/passwd")).rejects.toThrow(/outside the selected workspace/i);
  });

  it("converts RTF to DOCX bytes on macOS", async () => {
    if (process.platform !== "darwin") return;

    await writeFile(path.join(root, "sample.rtf"), "{\\rtf1\\ansi PuppyOne}");
    const out = await convertWorkspaceOfficeDocumentToDocx(root, "sample.rtf");
    expect(out.bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("surfaces binary files (null bytes) with content=null", async () => {
    await writeFile(path.join(root, "img.bin"), Buffer.from([0x00, 0x01, 0x02, 0x00]));
    const file = await readWorkspaceTextFile(root, "img.bin");
    expect(file.content).toBeNull();
  });

  it("errors when reading a folder as text", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "dir", kind: "folder" });
    await expect(readWorkspaceTextFile(root, "dir")).rejects.toThrow(/folder/i);
  });
});

describe("listFolderChildren", () => {
  it("lists entries folders-first then alphabetical, with content preview for small files", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "zeta.txt", kind: "file", content: "z" });
    await createWorkspaceEntry(root, { parentPath: null, name: "alpha.txt", kind: "file", content: "a" });
    await createWorkspaceEntry(root, { parentPath: null, name: "beta", kind: "folder" });

    const nodes = await listFolderChildren(root, null);
    expect(nodes.map((n) => n.name)).toEqual(["beta", "alpha.txt", "zeta.txt"]);
    expect(nodes[0].type).toBe("folder");
    const alpha = nodes.find((n) => n.name === "alpha.txt");
    expect(alpha.content).toBe("a"); // small text file preview
    expect(alpha.path).toBe("alpha.txt");
  });

  it("skips symbolic links (no symlink escape)", async () => {
    await writeFile(path.join(root, "real.txt"), "real");
    const secret = path.join(external, "secret.txt");
    await writeFile(secret, "SECRET");
    try {
      await symlink(secret, path.join(root, "link.txt"));
    } catch {
      return; // symlink not permitted on this platform/user — skip
    }
    const nodes = await listFolderChildren(root, null);
    expect(nodes.map((n) => n.name)).toContain("real.txt");
    expect(nodes.map((n) => n.name)).not.toContain("link.txt");
  });
});

describe("rename / move / delete", () => {
  it("renames a file", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "old.txt", kind: "file", content: "keep" });
    const res = await renameWorkspaceEntry(root, { path: "old.txt", nextName: "new.txt" });
    expect(res.path).toBe("new.txt");
    expect(await readFile(path.join(root, "new.txt"), "utf8")).toBe("keep");
    await expect(stat(path.join(root, "old.txt"))).rejects.toThrow();
  });

  it("refuses to rename onto an existing name", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "a.txt", kind: "file", content: "a" });
    await createWorkspaceEntry(root, { parentPath: null, name: "b.txt", kind: "file", content: "b" });
    await expect(renameWorkspaceEntry(root, { path: "a.txt", nextName: "b.txt" })).rejects.toThrow(/already exists/i);
  });

  it("refuses to rename the workspace root", async () => {
    await expect(renameWorkspaceEntry(root, { path: "", nextName: "x" })).rejects.toThrow(/root/i);
  });

  it("moves a file into a subfolder", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "docs", kind: "folder" });
    await createWorkspaceEntry(root, { parentPath: null, name: "a.txt", kind: "file", content: "a" });
    const res = await moveWorkspaceEntry(root, { fromPath: "a.txt", toPath: "docs/a.txt" });
    expect(res.path).toBe("docs/a.txt");
    expect(await readFile(path.join(root, "docs", "a.txt"), "utf8")).toBe("a");
  });

  it("refuses to move a folder into itself", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "dir", kind: "folder" });
    await expect(moveWorkspaceEntry(root, { fromPath: "dir", toPath: "dir/sub" })).rejects.toThrow(/into itself/i);
  });

  it("deletes a file", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "gone.txt", kind: "file", content: "x" });
    await deleteWorkspaceEntry(root, { path: "gone.txt" });
    await expect(stat(path.join(root, "gone.txt"))).rejects.toThrow();
  });

  it("deletes a folder recursively", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "dir", kind: "folder" });
    await createWorkspaceEntry(root, { parentPath: "dir", name: "child.txt", kind: "file", content: "x" });
    await deleteWorkspaceEntry(root, { path: "dir" });
    await expect(stat(path.join(root, "dir"))).rejects.toThrow();
  });

  it("refuses to delete the workspace root", async () => {
    await expect(deleteWorkspaceEntry(root, { path: "" })).rejects.toThrow(/root/i);
  });
});

describe("importWorkspaceEntries", () => {
  it("imports real external files and folders by copy", async () => {
    await writeFile(path.join(external, "import-me.txt"), "external content");
    await mkdir(path.join(external, "folder"));
    await writeFile(path.join(external, "folder", "nested.txt"), "nested");

    const res = await importWorkspaceEntries(root, {
      sourcePaths: [path.join(external, "import-me.txt"), path.join(external, "folder")],
      targetFolderPath: null,
    });
    expect(res.paths.sort()).toEqual(["folder", "import-me.txt"]);
    expect(await readFile(path.join(root, "import-me.txt"), "utf8")).toBe("external content");
    expect(await readFile(path.join(root, "folder", "nested.txt"), "utf8")).toBe("nested");
  });

  it("rejects relative source paths", async () => {
    await expect(
      importWorkspaceEntries(root, { sourcePaths: ["relative/path.txt"], targetFolderPath: null }),
    ).rejects.toThrow(/absolute/i);
  });

  it("rejects symbolic-link sources", async () => {
    const target = path.join(external, "target.txt");
    await writeFile(target, "t");
    const link = path.join(external, "link.txt");
    try {
      await symlink(target, link);
    } catch {
      return; // symlink not permitted — skip
    }
    await expect(
      importWorkspaceEntries(root, { sourcePaths: [link], targetFolderPath: null }),
    ).rejects.toThrow(/Symbolic links/i);
  });

  it("rejects importing onto an existing name", async () => {
    await createWorkspaceEntry(root, { parentPath: null, name: "dup.txt", kind: "file", content: "existing" });
    await writeFile(path.join(external, "dup.txt"), "incoming");
    await expect(
      importWorkspaceEntries(root, { sourcePaths: [path.join(external, "dup.txt")], targetFolderPath: null }),
    ).rejects.toThrow(/already exists/i);
  });
});

describe("path-traversal containment (security)", () => {
  const escapes = ["../escape.txt", "../../escape.txt", "a/../../escape.txt", "/etc/passwd"];

  it("blocks traversal in createWorkspaceEntry parentPath", async () => {
    for (const parentPath of ["..", "../..", "/abs"]) {
      await expect(
        createWorkspaceEntry(root, { parentPath, name: "x.txt", kind: "file" }),
      ).rejects.toThrow(/outside the selected workspace/i);
    }
  });

  it("blocks traversal in readWorkspaceTextFile", async () => {
    for (const rel of escapes) {
      await expect(readWorkspaceTextFile(root, rel)).rejects.toThrow();
    }
  });

  it("blocks traversal in listFolderChildren", async () => {
    for (const rel of ["..", "../..", "/etc"]) {
      await expect(listFolderChildren(root, rel)).rejects.toThrow(/outside the selected workspace/i);
    }
  });

  it("blocks traversal in delete / rename / move", async () => {
    await expect(deleteWorkspaceEntry(root, { path: "../x" })).rejects.toThrow(/outside the selected workspace/i);
    await expect(renameWorkspaceEntry(root, { path: "../x", nextName: "y" })).rejects.toThrow(/outside the selected workspace/i);
    await expect(moveWorkspaceEntry(root, { fromPath: "../x", toPath: "y" })).rejects.toThrow(/outside the selected workspace/i);
  });

  it("does not write outside root even when traversal is attempted", async () => {
    const sentinel = path.join(external, "escape.txt");
    await createWorkspaceEntry(root, { parentPath: null, name: "sub", kind: "folder" }).catch(() => {});
    await createWorkspaceEntry(root, { parentPath: "sub", name: "victim.txt", kind: "file", content: "x" });
    // attempt to traverse out via move
    await expect(
      moveWorkspaceEntry(root, { fromPath: "sub/victim.txt", toPath: "../../escape.txt" }),
    ).rejects.toThrow();
    await expect(lstat(sentinel)).rejects.toThrow(); // nothing written outside
  });
});

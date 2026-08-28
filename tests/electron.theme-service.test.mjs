import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeService } from "../electron/main/themes/theme-service.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe("host-owned CSS theme service", () => {
  it("discovers manifest packages and Typora-style top-level CSS themes", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    await mkdir(path.join(themeRoot, "paper"), { recursive: true });
    await writeJson(path.join(themeRoot, "paper", "theme.json"), {
      schemaVersion: 1,
      id: "com.example.paper",
      name: "Paper",
      version: "1.0.0",
      modes: ["light"],
      targets: ["markdown", "csv"],
      entrypoints: { markdown: "markdown.css", csv: "csv.css" },
    });
    await writeFile(path.join(themeRoot, "paper", "markdown.css"), "h1 { color: #392f28 }", "utf8");
    await writeFile(path.join(themeRoot, "paper", "csv.css"), "th { background: #ede4d6 }", "utf8");
    await writeFile(path.join(themeRoot, "newsprint.css"), ":root { --text-color: #222 } #write { color: var(--text-color) }", "utf8");

    const service = createThemeService({ userDataPath, shell: createShell() });
    const snapshot = await service.listThemes();

    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.themes.map(({ id, source, targets }) => ({ id, source, targets }))).toEqual([
      { id: "local.css.newsprint", source: "local-css", targets: ["markdown"] },
      { id: "com.example.paper", source: "local-package", targets: ["markdown", "csv"] },
    ]);
    expect(snapshot.themes[0].compiledCss.markdown).toContain('data-po-theme-id="local.css.newsprint"');
    expect(snapshot.themes[1].compiledCss.csv).toContain('data-po-theme-surface="csv"');
    expect(JSON.stringify(snapshot)).not.toContain(userDataPath);
  });

  it("resolves package-local imports and assets without exposing file paths", async () => {
    const userDataPath = await createTemporaryDirectory();
    const packagePath = path.join(userDataPath, "themes", "reader");
    await mkdir(path.join(packagePath, "styles"), { recursive: true });
    await mkdir(path.join(packagePath, "fonts"), { recursive: true });
    await writeJson(path.join(packagePath, "theme.json"), {
      schemaVersion: 1,
      id: "com.example.reader",
      name: "Reader",
      version: "1.0.0",
      modes: ["light"],
      targets: ["markdown"],
      entrypoints: { markdown: "markdown.css" },
    });
    await writeFile(path.join(packagePath, "markdown.css"), '@import "./styles/content.css";', "utf8");
    await writeFile(
      path.join(packagePath, "styles", "content.css"),
      '@font-face { font-family: Reader; src: url("../fonts/reader.woff2") format("woff2") } body { font-family: Reader }',
      "utf8",
    );
    await writeFile(path.join(packagePath, "fonts", "reader.woff2"), Buffer.from("font-data"));

    const snapshot = await createThemeService({ userDataPath, shell: createShell() }).listThemes();

    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.themes[0].compiledCss.markdown).toContain("data:font/woff2;base64,");
    expect(snapshot.themes[0].compiledCss.markdown).not.toContain("@import");
    expect(snapshot.themes[0].compiledCss.markdown).not.toContain(userDataPath);
  });

  it("isolates invalid themes and reports duplicate IDs deterministically", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    await createPackage(themeRoot, "a-first", "com.example.duplicate", "First");
    await createPackage(themeRoot, "b-second", "com.example.duplicate", "Second");
    await mkdir(path.join(themeRoot, "broken"), { recursive: true });
    await writeFile(path.join(themeRoot, "broken", "theme.json"), "{", "utf8");
    await writeFile(path.join(themeRoot, "remote.css"), 'body { background: url("https://example.com/pixel.png") }', "utf8");

    const snapshot = await createThemeService({ userDataPath, shell: createShell() }).listThemes();

    expect(snapshot.themes).toHaveLength(1);
    expect(snapshot.themes[0]).toMatchObject({ id: "com.example.duplicate", name: "First" });
    expect(snapshot.diagnostics.map((diagnostic) => diagnostic.source)).toEqual([
      "b-second",
      "broken",
      "remote.css",
    ]);
    expect(snapshot.diagnostics.every((diagnostic) => !diagnostic.message.includes(userDataPath))).toBe(true);
  });

  it("creates and opens only its exact user-data theme directory", async () => {
    const userDataPath = await createTemporaryDirectory();
    const shell = createShell();
    const service = createThemeService({ userDataPath, shell });

    const result = await service.openDirectory();

    expect(result).toEqual({ opened: true });
    expect(shell.openPath).toHaveBeenCalledExactlyOnceWith(path.join(userDataPath, "themes"));
  });
});

async function createTemporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "puppyone-theme-service-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createShell() {
  return { openPath: vi.fn(async () => "") };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value), "utf8");
}

async function createPackage(themeRoot, directoryName, id, name) {
  const packagePath = path.join(themeRoot, directoryName);
  await mkdir(packagePath, { recursive: true });
  await writeJson(path.join(packagePath, "theme.json"), {
    schemaVersion: 1,
    id,
    name,
    version: "1.0.0",
    modes: ["light"],
    targets: ["markdown"],
    entrypoints: { markdown: "markdown.css" },
  });
  await writeFile(path.join(packagePath, "markdown.css"), "body { color: #222 }", "utf8");
}

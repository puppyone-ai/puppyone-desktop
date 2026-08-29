import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
  it("installs missing starter packages and never overwrites user edits", async () => {
    const userDataPath = await createTemporaryDirectory();
    const bundledThemesPath = await createTemporaryDirectory();
    for (const [directoryName, name] of [
      ["github", "GitHub"],
      ["forest", "Forest"],
      ["night", "Night"],
      ["rose", "Rose"],
    ]) {
      await createPack(
        bundledThemesPath,
        directoryName,
        `builtin.pack.${directoryName}`,
        name,
      );
    }
    const service = createThemeService({ userDataPath, bundledThemesPath, shell: createShell() });

    const first = await service.listThemes();
    const installed = first.themes.find((theme) => theme.id === "builtin.pack.forest");
    expect(installed).toMatchObject({
      name: "Forest",
      source: "local-package",
      targets: ["application", "markdown", "csv"],
    });

    const installedMarkdown = path.join(userDataPath, "themes", "forest", "markdown.css");
    await writeFile(installedMarkdown, "body { color: rebeccapurple }", "utf8");
    await service.listThemes();
    expect(await readFile(installedMarkdown, "utf8")).toBe("body { color: rebeccapurple }");

    await rm(path.dirname(installedMarkdown), { recursive: true });
    const afterDeletion = await service.listThemes();
    expect(afterDeletion.themes.some((theme) => theme.id === "builtin.pack.forest"))
      .toBe(false);
  });

  it("ships four valid starter packages for the user theme directory", async () => {
    const userDataPath = await createTemporaryDirectory();
    const service = createThemeService({
      userDataPath,
      bundledThemesPath: path.join(process.cwd(), "electron", "themes"),
      shell: createShell(),
    });

    const snapshot = await service.listThemes();

    expect(snapshot.diagnostics).toEqual([]);
    expect(snapshot.themes.map(({ id, source, targets }) => ({ id, source, targets }))).toEqual([
      { id: "builtin.pack.forest", source: "local-package", targets: ["application", "markdown", "csv"] },
      { id: "builtin.pack.github", source: "local-package", targets: ["application", "markdown", "csv"] },
      { id: "builtin.pack.night", source: "local-package", targets: ["application", "markdown", "csv"] },
      { id: "builtin.pack.rose", source: "local-package", targets: ["application", "markdown", "csv"] },
    ]);
  });

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

  it("persists valid managed Custom CSS and exposes it as a three-surface package", async () => {
    const userDataPath = await createTemporaryDirectory();
    const service = createThemeService({ userDataPath, shell: createShell() });

    expect(await service.readCustomCss("markdown")).toEqual({ css: "" });
    await service.saveCustomCss({
      target: "markdown",
      css: "body { color: #334155 }",
    });

    expect(await service.readCustomCss("markdown")).toEqual({
      css: "body { color: #334155 }",
    });
    const custom = (await service.listThemes()).themes.find(
      (theme) => theme.id === "local.puppyone.custom-css",
    );
    expect(custom).toMatchObject({
      name: "My Custom CSS",
      targets: ["application", "markdown", "csv"],
    });
    expect(custom.compiledCss.markdown).toContain('data-po-theme-surface="markdown"');
  });

  it("rejects invalid managed CSS without replacing the last valid source", async () => {
    const userDataPath = await createTemporaryDirectory();
    const service = createThemeService({ userDataPath, shell: createShell() });
    const validCss = "body { color: #334155 }";
    await service.saveCustomCss({ target: "markdown", css: validCss });

    await expect(service.saveCustomCss({
      target: "markdown",
      css: 'body { background: url("https://example.com/pixel.png") }',
    })).rejects.toThrow("cannot load external asset URL");
    await expect(service.saveCustomCss({
      target: "../../outside",
      css: "body { color: red }",
    })).rejects.toThrow("Custom CSS target is invalid");

    expect(await readFile(
      path.join(userDataPath, "themes", "puppyone-custom-css", "markdown.css"),
      "utf8",
    )).toBe(validCss);
  });

  it("rejects managed Custom CSS roots redirected through symlinks", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    const outside = await createTemporaryDirectory();
    await mkdir(themeRoot, { recursive: true });
    await writeFile(path.join(outside, "markdown.css"), "body { color: red }", "utf8");
    await symlink(outside, path.join(themeRoot, "puppyone-custom-css"));

    const service = createThemeService({ userDataPath, shell: createShell() });

    await expect(service.readCustomCss("markdown")).rejects.toThrow("managed theme directory");
    await expect(service.saveCustomCss({ target: "markdown", css: "body { color: blue }" }))
      .rejects.toThrow("managed theme directory");
    expect(await readFile(path.join(outside, "markdown.css"), "utf8"))
      .toBe("body { color: red }");
  });

  it("rejects a user-data theme root redirected through a symlink", async () => {
    const userDataPath = await createTemporaryDirectory();
    const outside = await createTemporaryDirectory();
    await symlink(outside, path.join(userDataPath, "themes"));

    const service = createThemeService({ userDataPath, shell: createShell() });

    await expect(service.listThemes()).rejects.toThrow("theme root");
    await expect(service.saveCustomCss({ target: "markdown", css: "body { color: blue }" }))
      .rejects.toThrow("theme root");
    await expect(readFile(path.join(outside, "markdown.css"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves every target during concurrent first saves", async () => {
    const userDataPath = await createTemporaryDirectory();
    const service = createThemeService({ userDataPath, shell: createShell() });
    const sources = {
      application: ".theme-root { --po-accent: #2563eb }",
      markdown: "body { color: #334155 }",
      csv: ".theme-root { --po-csv-surface-color: #0f172a }",
    };

    await Promise.all(Object.entries(sources).map(([target, css]) => (
      service.saveCustomCss({ target, css })
    )));

    await expect(service.readCustomCss("application")).resolves.toEqual({ css: sources.application });
    await expect(service.readCustomCss("markdown")).resolves.toEqual({ css: sources.markdown });
    await expect(service.readCustomCss("csv")).resolves.toEqual({ css: sources.csv });
  });

  it("rejects manifest entrypoint symlinks that escape a package", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    const packagePath = path.join(themeRoot, "escaped");
    await mkdir(packagePath, { recursive: true });
    await writeJson(path.join(packagePath, "theme.json"), {
      schemaVersion: 1,
      id: "com.example.escaped",
      name: "Escaped",
      version: "1.0.0",
      modes: ["light"],
      targets: ["markdown"],
      entrypoints: { markdown: "markdown.css" },
    });
    const outsideCss = path.join(userDataPath, "outside.css");
    await writeFile(outsideCss, "body { color: red }", "utf8");
    await symlink(outsideCss, path.join(packagePath, "markdown.css"));

    const snapshot = await createThemeService({ userDataPath, shell: createShell() }).listThemes();

    expect(snapshot.themes).toEqual([]);
    expect(snapshot.diagnostics[0]).toMatchObject({ source: "escaped" });
    expect(snapshot.diagnostics[0].message).toContain("escapes its package");
  });

  it("rejects manifest symlinks that escape a package", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    const packagePath = path.join(themeRoot, "manifest-link");
    await mkdir(packagePath, { recursive: true });
    const outsideManifest = path.join(userDataPath, "outside-theme.json");
    await writeJson(outsideManifest, {
      schemaVersion: 1,
      id: "com.example.manifest-link",
      name: "Manifest Link",
      version: "1.0.0",
      modes: ["light"],
      targets: ["markdown"],
      entrypoints: { markdown: "markdown.css" },
    });
    await symlink(outsideManifest, path.join(packagePath, "theme.json"));

    const snapshot = await createThemeService({ userDataPath, shell: createShell() }).listThemes();

    expect(snapshot.themes).toEqual([]);
    expect(snapshot.diagnostics[0].message).toContain("escapes its package");
  });

  it("rejects themes whose aggregate imported CSS exceeds the compilation budget", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    const packagePath = path.join(themeRoot, "oversized");
    await createPackage(themeRoot, "oversized", "com.example.oversized", "Oversized");
    const largeComment = `/*${"x".repeat(1_500_000)}*/`;
    await writeFile(
      path.join(packagePath, "markdown.css"),
      '@import "a.css"; @import "b.css"; @import "c.css";',
      "utf8",
    );
    await Promise.all(["a.css", "b.css", "c.css"].map((filename) => (
      writeFile(path.join(packagePath, filename), largeComment, "utf8")
    )));

    const snapshot = await createThemeService({ userDataPath, shell: createShell() }).listThemes();

    expect(snapshot.themes).toEqual([]);
    expect(snapshot.diagnostics[0].message).toContain("aggregate CSS size limit");
  });

  it("rejects repeated asset expansion before compiled CSS exceeds its output budget", async () => {
    const userDataPath = await createTemporaryDirectory();
    const themeRoot = path.join(userDataPath, "themes");
    const packagePath = path.join(themeRoot, "expanded-asset");
    await createPackage(themeRoot, "expanded-asset", "com.example.expanded-asset", "Expanded Asset");
    await writeFile(path.join(packagePath, "background.png"), Buffer.alloc(5 * 1024 * 1024));
    await writeFile(
      path.join(packagePath, "markdown.css"),
      [
        '.one { background: url("./background.png") }',
        '.two { background: url("./background.png") }',
        '.three { background: url("./background.png") }',
      ].join("\n"),
      "utf8",
    );

    const snapshot = await createThemeService({ userDataPath, shell: createShell() }).listThemes();

    expect(snapshot.themes).toEqual([]);
    expect(snapshot.diagnostics[0].message).toContain("embedded asset expansion limit");
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

async function createPack(themeRoot, directoryName, id, name) {
  const packagePath = path.join(themeRoot, directoryName);
  await mkdir(packagePath, { recursive: true });
  await writeJson(path.join(packagePath, "theme.json"), {
    schemaVersion: 1,
    id,
    name,
    version: "1.0.0",
    modes: ["light", "dark"],
    targets: ["application", "markdown", "csv"],
    entrypoints: {
      application: "application.css",
      markdown: "markdown.css",
      csv: "csv.css",
    },
  });
  await writeFile(path.join(packagePath, "application.css"), ".theme-root { --po-accent: #2563eb }", "utf8");
  await writeFile(path.join(packagePath, "markdown.css"), "body { color: #222 }", "utf8");
  await writeFile(path.join(packagePath, "csv.css"), ".theme-root { --po-csv-surface-color: #222 }", "utf8");
}

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileThemeCss } from "../electron/main/themes/theme-css-compiler.mjs";
import { parseSingleFileThemeCss } from "../electron/main/themes/theme-single-file-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(repoRoot, "sub-themes");

describe("built-in Sub Theme package architecture", () => {
  it("keeps one self-describing theme.css in every built-in package", () => {
    const packages = readdirSync(packagesRoot, { withFileTypes: true })
      .filter((entry) => entry.name !== ".DS_Store")
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(packages.map((entry) => entry.name)).toEqual([
      "default-github",
      "default-graphite",
      "default-neutral",
      "default-newspaper",
      "default-warm",
      "windows-xp-luna-blue",
    ]);
    for (const entry of packages) {
      expect(entry.isDirectory()).toBe(true);
      expect(readdirSync(path.join(packagesRoot, entry.name))).toEqual(["theme.css"]);
    }
  });

  it("parses and compiles every package through the same public token boundary", async () => {
    const themes = [];
    for (const directory of readdirSync(packagesRoot).sort()) {
      const sourcePath = `sub-themes/${directory}/theme.css`;
      const theme = parseSingleFileThemeCss(
        readFileSync(path.join(repoRoot, sourcePath), "utf8"),
        {
          sourcePath,
          allowReservedBuiltinId: true,
          allowBuiltinCompatibilityMetadata: true,
        },
      );
      expect(theme).not.toBeNull();
      expect(directory).toBe(theme.id.replaceAll(".", "-"));
      for (const target of theme.targets) {
        const result = await compileThemeCss({
          css: theme.stylesheets[target],
          themeId: theme.id,
          target,
          supportedModes: theme.modes,
          allowReservedBuiltinId: true,
        });
        expect(result.css).not.toMatch(/\.cm-|\.markdown-codemirror-editor|\.csv-table-editor/);
        expect(result.css).not.toContain("@puppyone");
        if (target === "application") {
          for (const mode of theme.modes) {
            expect(result.firstPaint?.[mode], `${theme.id}:${mode}`).toMatchObject({
              background: expect.stringMatching(/^#[0-9a-f]{6}$/),
              colorScheme: mode,
            });
          }
        }
      }
      themes.push(theme);
    }
    expect(themes.sort((left, right) => left.builtinOrder - right.builtinOrder).map(({ id }) => id))
      .toEqual([
        "default.neutral",
        "default.warm",
        "default.graphite",
        "default.github",
        "default.newspaper",
        "windows-xp.luna-blue",
      ]);
  });

  it("keeps the generated runtime registry synchronized", () => {
    expect(() => execFileSync(
      process.execPath,
      ["scripts/generate-builtin-sub-themes.mjs", "--check"],
      { cwd: repoRoot, stdio: "pipe" },
    )).not.toThrow();
  });

  it("keeps Neutral's declared Dark mode complete at the application boundary", async () => {
    const sourcePath = "sub-themes/default-neutral/theme.css";
    const theme = parseSingleFileThemeCss(
      readFileSync(path.join(repoRoot, sourcePath), "utf8"),
      {
        sourcePath,
        allowReservedBuiltinId: true,
        allowBuiltinCompatibilityMetadata: true,
      },
    );
    const result = await compileThemeCss({
      css: theme.stylesheets.application,
      themeId: theme.id,
      target: "application",
      supportedModes: theme.modes,
      allowReservedBuiltinId: true,
    });
    const darkHost = `[data-po-appearance-root][data-sub-theme-id="default.neutral"]:where(.dark)`;
    expect(result.css).toContain(`${darkHost} {`);
    expect(result.css).toContain("--po-header: color-mix(");
    expect(result.css).toContain("--po-sidebar: color-mix(");
    expect(result.css).toContain("--po-text: #fafafa");
  });

  it("keeps Warm's light shell surfaces from leaking into Dark mode", async () => {
    const sourcePath = "sub-themes/default-warm/theme.css";
    const theme = parseSingleFileThemeCss(
      readFileSync(path.join(repoRoot, sourcePath), "utf8"),
      {
        sourcePath,
        allowReservedBuiltinId: true,
        allowBuiltinCompatibilityMetadata: true,
      },
    );
    const result = await compileThemeCss({
      css: theme.stylesheets.application,
      themeId: theme.id,
      target: "application",
      supportedModes: theme.modes,
      allowReservedBuiltinId: true,
    });
    const darkHost = `[data-po-appearance-root][data-sub-theme-id="default.warm"]:where(.dark)`;
    expect(result.css).toContain(`${darkHost} {`);
    expect(result.css).toContain("--po-header: color-mix(in srgb, var(--po-surface-chrome) 40%, var(--po-surface-editor))");
    expect(result.css).toContain("--po-sidebar: color-mix(in srgb, var(--po-surface-chrome) 40%, var(--po-surface-editor))");
  });

  it("removes legacy preset palettes from the global token layer", () => {
    const globalTokens = readFileSync(path.join(repoRoot, "src/styles/tokens.css"), "utf8");
    const fallback = readFileSync(path.join(repoRoot, "src/styles/fallback-theme.generated.css"), "utf8");
    expect(globalTokens).not.toContain("data-light-theme-preset=");
    expect(globalTokens).not.toContain("data-dark-theme-preset=");
    expect(globalTokens).not.toContain("--po-surface-panel: #fafafa");
    expect(fallback).toContain("generated from sub-themes/default-neutral/theme.css");
    expect(fallback).toContain("--po-surface-panel: #fafafa");
  });
});

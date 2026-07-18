import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("renderer style architecture", () => {
  it("keeps one deterministic cascade and one renderer reset owner", () => {
    const cascade = source("src/styles/cascade.css");
    const entry = source("src/main.tsx");
    const styles = source("src/styles.css");
    const tailwindConfig = source("tailwind.config.cjs");

    expect(cascade.trim()).toBe("@layer reset, tokens, primitives, patterns, features, overrides;");
    expectInOrder(entry, [
      'import "./styles/cascade.css";',
      'import "./cloud-globals.css";',
      'import "@puppyone/shared-ui/shared-ui.css";',
      'import "./styles.css";',
    ]);
    expectInOrder(styles, [
      '@import "./features/source-control/source-control.css" layer(features);',
      '@import "./features/source-control/source-control-overrides.css";',
    ]);
    expect(styles).toContain('@import "./styles/base.css" layer(reset);');
    expect(tailwindConfig).toMatch(/corePlugins\s*:\s*\{[\s\S]*?preflight\s*:\s*false/);
  });

  it("keeps Tailwind global directives in one entry file", () => {
    const tailwindEntry = source("src/cloud-globals.css");
    expect(tailwindEntry.trim()).toBe("@tailwind base;\n@tailwind components;\n@tailwind utilities;");

    const duplicateEntries = walkCss(path.join(repoRoot, "src"))
      .filter((filePath) => path.relative(repoRoot, filePath) !== path.join("src", "cloud-globals.css"))
      .filter((filePath) => /^\s*@tailwind\s+(?:base|components|utilities)\s*;/m.test(readFileSync(filePath, "utf8")));
    expect(duplicateEntries).toEqual([]);
  });
});

function source(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function expectInOrder(sourceText: string, needles: string[]) {
  let cursor = -1;
  for (const needle of needles) {
    const next = sourceText.indexOf(needle, cursor + 1);
    expect(next, needle).toBeGreaterThan(cursor);
    cursor = next;
  }
}

function walkCss(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkCss(filePath);
    return statSync(filePath).isFile() && filePath.endsWith(".css") ? [filePath] : [];
  });
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fileActionCss = readFileSync(
  new URL("../src/styles/file-actions.css", import.meta.url),
  "utf8",
);

describe("create entry dialog visual architecture", () => {
  it("uses a compact single-line title treatment", () => {
    expect(fileActionCss).toMatch(
      /\.desktop-create-entry-dialog \.desktop-dialog-title-row\s*\{[^}]*align-items:\s*center;/s,
    );
  });

  it("keeps its field label sentence-cased without changing every dialog", () => {
    const fieldRule = fileActionCss.match(
      /\.desktop-create-entry-dialog \.desktop-dialog-field\s*\{([^}]*)\}/s,
    )?.[1];

    expect(fieldRule).toContain("letter-spacing: 0;");
    expect(fieldRule).toContain("text-transform: none;");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const markdownFocusFixture = readFileSync(
  new URL("../scripts/fixtures/markdown-pane-focus-continuity.tsx", import.meta.url),
  "utf8",
);

describe("CI Electron smoke sandbox boundary", () => {
  it("limits the GitHub runner sandbox fallback to the Chromium smoke step", () => {
    const jobEnvironment = workflow.slice(
      workflow.indexOf("    env:"),
      workflow.indexOf("    steps:"),
    );
    const smokeStep = readStep(
      "Test MDI focus continuity in Chromium",
      "Build",
    );

    expect(jobEnvironment).not.toContain("ELECTRON_DISABLE_SANDBOX");
    expect(smokeStep).toContain('ELECTRON_DISABLE_SANDBOX: "1"');
    expect(smokeStep).toContain(
      "xvfb-run --auto-servernum npm run smoke:markdown-pane-focus-continuity",
    );
  });

  it("keeps the smoke fixture on the current split-view input contract", () => {
    expect(markdownFocusFixture).toContain("editorTree={tree}");
    expect(markdownFocusFixture).toContain(
      "markdownEnvironment={EMPTY_MARKDOWN_WORKSPACE_ENVIRONMENT}",
    );
    expect(markdownFocusFixture).not.toContain("state={workspaceState}");
  });
});

function readStep(name, nextName) {
  const start = workflow.indexOf(`      - name: ${name}`);
  const end = workflow.indexOf(`\n      - name: ${nextName}`, start);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to locate CI step ${name}`);
  }
  return workflow.slice(start, end);
}

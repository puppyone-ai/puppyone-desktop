import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const workflow = readFileSync(
  new URL("../.github/workflows/desktop-internal-build.yml", import.meta.url),
  "utf8",
);

describe("macOS release trust chain", () => {
  it("requires hardened signing, notarization and signed updater artifacts", () => {
    expect(packageJson.build.mac.hardenedRuntime).toBe(true);
    expect(packageJson.build.mac.notarize).toBe(true);
    expect(packageJson.build.mac.identity).toBeUndefined();
    expect(packageJson.build.mac.entitlements).toBe("build/entitlements.mac.plist");
    expect(packageJson.build.publish[0].url).toMatch(/^https:\/\//);
    expect(packageJson.scripts["dist:mac"]).toContain("verify:mac-release-env");
  });

  it("refuses a release when signing or notarization credentials are absent", () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("../scripts/verify-macos-release-env.mjs", import.meta.url))],
      { encoding: "utf8", env: {} },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to create an unsigned or unnotarized macOS release");
  });

  it("verifies codesign, Gatekeeper and stapled tickets before publishing", () => {
    expect(workflow).toContain("codesign --verify --deep --strict");
    expect(workflow).toContain("spctl --assess --type execute");
    expect(workflow).toContain("xcrun stapler validate");
    expect(workflow).toContain("for artifact in release/*.dmg; do");
    expect(workflow).not.toContain("CSC_IDENTITY_AUTO_DISCOVERY: \"false\"");
  });
});

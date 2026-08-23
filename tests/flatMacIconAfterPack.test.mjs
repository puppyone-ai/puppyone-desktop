import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import plist from "plist";
import { afterEach, describe, expect, it } from "vitest";
import useFlatMacIconAfterPack from "../scripts/after-pack-flat-macos-icon.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.rm(directory, { recursive: true, force: true })
  )));
});

describe("flat macOS application icon afterPack hook", () => {
  it("deletes the generated ICNS and points Finder directly at the flat PNG", async () => {
    const appOutDir = await fs.mkdtemp(path.join(os.tmpdir(), "puppyone-flat-icon-hook-"));
    temporaryDirectories.push(appOutDir);
    const contentsPath = path.join(appOutDir, "PuppyOne.app", "Contents");
    const resourcesPath = path.join(contentsPath, "Resources");
    await fs.mkdir(resourcesPath, { recursive: true });
    await fs.writeFile(path.join(resourcesPath, "logo-square.png"), "flat-png");
    await fs.writeFile(path.join(resourcesPath, "icon.icns"), "generated-icns");
    await fs.writeFile(path.join(contentsPath, "Info.plist"), plist.build({
      CFBundleIconFile: "icon.icns",
      CFBundleIconName: "Icon",
    }));

    await useFlatMacIconAfterPack({
      electronPlatformName: "darwin",
      appOutDir,
      packager: { appInfo: { productFilename: "PuppyOne" } },
    });

    await expect(fs.access(path.join(resourcesPath, "icon.icns"))).rejects.toThrow();
    const info = plist.parse(await fs.readFile(path.join(contentsPath, "Info.plist"), "utf8"));
    expect(info.CFBundleIconFile).toBe("logo-square.png");
    expect(info.CFBundleIconName).toBeUndefined();
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import plist from "plist";
import { afterEach, describe, expect, it } from "vitest";
import useMacAppImageAfterPack from "../scripts/after-pack-macos-app-image.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.rm(directory, { recursive: true, force: true })
  )));
});

describe("macOS App Image afterPack hook", () => {
  it("deletes the generated ICNS and points Finder directly at the authored App Image", async () => {
    const appOutDir = await fs.mkdtemp(path.join(os.tmpdir(), "puppyone-app-image-hook-"));
    temporaryDirectories.push(appOutDir);
    const contentsPath = path.join(appOutDir, "PuppyOne.app", "Contents");
    const resourcesPath = path.join(contentsPath, "Resources");
    await fs.mkdir(resourcesPath, { recursive: true });
    await fs.writeFile(path.join(resourcesPath, "puppy-app-image.png"), "app-image-png");
    await fs.writeFile(path.join(resourcesPath, "icon.icns"), "generated-icns");
    await fs.writeFile(path.join(contentsPath, "Info.plist"), plist.build({
      CFBundleIconFile: "icon.icns",
      CFBundleIconName: "Icon",
    }));

    await useMacAppImageAfterPack({
      electronPlatformName: "darwin",
      appOutDir,
      packager: { appInfo: { productFilename: "PuppyOne" } },
    });

    await expect(fs.access(path.join(resourcesPath, "icon.icns"))).rejects.toThrow();
    const info = plist.parse(await fs.readFile(path.join(contentsPath, "Info.plist"), "utf8"));
    expect(info.CFBundleIconFile).toBe("puppy-app-image.png");
    expect(info.CFBundleIconName).toBeUndefined();
  });
});

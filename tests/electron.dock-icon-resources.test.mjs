import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDockIconResource } from "../electron/main/dock-icon-resources.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fsPromises.rm(directory, { force: true, recursive: true })
  )));
});

describe("dock icon resource resolution", () => {
  it("uses native extraResources first in a packaged production build", async () => {
    const fixture = await createFixture();
    const expected = path.join(fixture.resourcesPath, "dock-icon-light.png");
    await fsPromises.writeFile(expected, "native");

    expect(resolveDockIconResource({
      iconId: "light",
      developmentBuild: false,
      resourcesPath: fixture.resourcesPath,
      projectRoot: fixture.projectRoot,
    })).toEqual({ iconId: "light", path: expected });
  });

  it("falls back to packaged renderer assets instead of an absent public directory", async () => {
    const fixture = await createFixture();
    const expected = path.join(fixture.projectRoot, "dist", "logo-square-v0.1.3-dark.png");
    await fsPromises.mkdir(path.dirname(expected), { recursive: true });
    await fsPromises.writeFile(expected, "renderer");

    expect(resolveDockIconResource({
      iconId: "matte",
      developmentBuild: false,
      resourcesPath: fixture.resourcesPath,
      projectRoot: fixture.projectRoot,
    })).toEqual({ iconId: "matte", path: expected });
  });

  it("keeps source assets as the final development fallback and normalizes unknown ids", async () => {
    const fixture = await createFixture();
    const expected = path.join(fixture.projectRoot, "public", "logo-square-dev.png");
    await fsPromises.mkdir(path.dirname(expected), { recursive: true });
    await fsPromises.writeFile(expected, "source");

    expect(resolveDockIconResource({
      iconId: "unknown",
      developmentBuild: true,
      resourcesPath: fixture.resourcesPath,
      projectRoot: fixture.projectRoot,
    })).toEqual({ iconId: "polished", path: expected });
  });
});

async function createFixture() {
  const root = await fsPromises.mkdtemp(path.join(os.tmpdir(), "puppyone-dock-icon-"));
  temporaryDirectories.push(root);
  const resourcesPath = path.join(root, "PuppyOne.app", "Contents", "Resources");
  const projectRoot = path.join(resourcesPath, "app.asar");
  await fsPromises.mkdir(resourcesPath, { recursive: true });
  return { projectRoot, resourcesPath };
}

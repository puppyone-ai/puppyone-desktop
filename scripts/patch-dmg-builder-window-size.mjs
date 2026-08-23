import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const dmgBuilderPath = path.join(
  desktopRoot,
  "node_modules",
  "dmg-builder",
  "out",
  "dmgUtil.js",
);

const originalBlock = `    if (!(0, builder_util_1.isEmptyOrSpaces)(settings.background)) {
        const size = await getImageSizeUsingSips(settings.background);
        settings.window = { position: { x: 400, y: Math.round((1440 - size.height) / 2) }, size, ...settings.window };
    }`;

const patchedBlock = `    if (!(0, builder_util_1.isEmptyOrSpaces)(settings.background)) {
        const size = await getImageSizeUsingSips(settings.background);
        const configuredWindow = specification.window;
        settings.window = {
            position: {
                x: configuredWindow?.x ?? 400,
                y: configuredWindow?.y ?? Math.round((1440 - size.height) / 2),
            },
            size: {
                width: configuredWindow?.width ?? size.width,
                height: configuredWindow?.height ?? size.height,
            },
        };
    }`;

export function patchDmgBuilderWindowSource(source, sourceLabel = "dmg-builder/out/dmgUtil.js") {
  if (source.includes("const configuredWindow = specification.window;")) {
    return { changed: false, source };
  }

  const matches = source.split(originalBlock).length - 1;
  if (matches !== 1) {
    throw new Error(
      `${sourceLabel} no longer matches the reviewed DMG window patch; expected one target block, found ${matches}.`,
    );
  }

  return { changed: true, source: source.replace(originalBlock, patchedBlock) };
}

export function patchInstalledDmgBuilder() {
  if (!existsSync(dmgBuilderPath)) return;
  const source = readFileSync(dmgBuilderPath, "utf8");
  const result = patchDmgBuilderWindowSource(source, path.relative(desktopRoot, dmgBuilderPath));
  if (result.changed) writeFileSync(dmgBuilderPath, result.source);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  patchInstalledDmgBuilder();
}

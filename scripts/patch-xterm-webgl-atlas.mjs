import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(scriptPath), "..");
const bundlePaths = [
  path.join(desktopRoot, "node_modules", "@xterm", "addon-webgl", "lib", "addon-webgl.js"),
  path.join(desktopRoot, "node_modules", "@xterm", "addon-webgl", "lib", "addon-webgl.mjs"),
  // Vite's optimizer hash does not include patched dependency contents. Patch
  // an existing development cache as well so a local reinstall/restart cannot
  // keep serving the pre-backport bundle.
  path.join(desktopRoot, "node_modules", ".vite", "deps", "@xterm_addon-webgl.js"),
];

const generateMipmapPattern = /([A-Za-z_$][\w$]*)\.generateMipmap\(\1\.TEXTURE_2D\)/g;

/**
 * Backports xtermjs/xterm.js#5987 to the current stable WebGL addon.
 *
 * @xterm/addon-webgl 0.19 generates mipmaps for its glyph-atlas textures.
 * Chromium/ANGLE can keep the context alive while returning corrupted atlas
 * samples, so xterm's context-loss callback cannot recover. Upstream removed
 * mipmaps and now uses ordinary linear filtering; keep this narrow transform
 * until that change ships in a stable addon compatible with xterm 6.
 */
export function patchXtermWebglSource(source, sourceLabel = "xterm WebGL bundle") {
  const matches = [...source.matchAll(generateMipmapPattern)];
  if (matches.length === 0) {
    const alreadyPatched = source.includes("TEXTURE_MIN_FILTER")
      && source.includes("TEXTURE_MAG_FILTER")
      && !source.includes("generateMipmap");
    if (alreadyPatched) return { changed: false, source };
    throw new Error(
      `${sourceLabel} no longer matches the reviewed glyph-atlas patch. `
      + "Review the installed @xterm/addon-webgl implementation before continuing.",
    );
  }
  if (matches.length !== 1) {
    throw new Error(`${sourceLabel} contains ${matches.length} generateMipmap calls; expected one.`);
  }

  const patchedSource = source.replace(generateMipmapPattern, (_call, gl) => (
    `${gl}.texParameteri(${gl}.TEXTURE_2D,${gl}.TEXTURE_MIN_FILTER,${gl}.LINEAR),`
    + `${gl}.texParameteri(${gl}.TEXTURE_2D,${gl}.TEXTURE_MAG_FILTER,${gl}.LINEAR)`
  ));
  return { changed: true, source: patchedSource };
}

export function patchInstalledXtermWebgl() {
  for (const bundlePath of bundlePaths) {
    if (!existsSync(bundlePath)) continue;
    const source = readFileSync(bundlePath, "utf8");
    const result = patchXtermWebglSource(source, path.relative(desktopRoot, bundlePath));
    if (result.changed) writeFileSync(bundlePath, result.source);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  patchInstalledXtermWebgl();
}

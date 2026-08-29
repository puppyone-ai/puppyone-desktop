import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { compileThemeCss } from "./theme-css-compiler.mjs";
import { parseThemeManifest } from "./theme-package-contract.mjs";
import { parseSingleFileThemeCss } from "./theme-single-file-contract.mjs";

const MAX_THEME_ENTRIES = 200;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_CSS_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_THEME_CSS_BYTES = 4 * 1024 * 1024;
const MAX_THEME_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_THEME_COMPILED_BYTES = 16 * 1024 * 1024;
const MAX_THEME_IMPORTS = 64;
const CUSTOM_THEME_DIRECTORY = "puppyone-custom-css";
const CUSTOM_THEME_ID = "local.puppyone.custom-css";
const THEME_GUIDE_MARKER = ".puppyone-theme-guide-v1";
const THEME_GUIDE_README = "README.md";
const themeTargets = Object.freeze(["application", "markdown", "csv"]);
const assetMimeTypes = new Map([
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

export function createThemeService({ userDataPath, bundledThemesPath, shell }) {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    throw new TypeError("A userData path is required for the theme service.");
  }
  if (!shell || typeof shell.openPath !== "function") {
    throw new TypeError("Electron shell.openPath is required for the theme service.");
  }
  const resolvedUserDataPath = path.resolve(userDataPath);
  const themeRoot = path.join(resolvedUserDataPath, "themes");
  let managedWriteQueue = Promise.resolve();
  let guideInstallQueue = Promise.resolve();

  const ensureRoot = async () => {
    await mkdir(resolvedUserDataPath, { recursive: true });
    const canonicalUserDataPath = await realpath(resolvedUserDataPath);
    await mkdir(themeRoot, { recursive: true });
    const canonicalThemeRoot = await realpath(themeRoot);
    if (canonicalThemeRoot !== path.join(canonicalUserDataPath, "themes")) {
      throw new TypeError("The theme root must remain inside the user-data directory.");
    }
    if (typeof bundledThemesPath === "string" && bundledThemesPath.trim()) {
      const operation = guideInstallQueue.then(() => installThemeGuide({
        bundledThemesPath: path.resolve(bundledThemesPath),
        themeRoot: canonicalThemeRoot,
      }));
      guideInstallQueue = operation.catch(() => undefined);
      await operation;
    }
    return canonicalThemeRoot;
  };

  const listThemes = async () => {
    const canonicalThemeRoot = await ensureRoot();
    const themes = [];
    const diagnostics = [];
    const ids = new Set();
    const entries = (await readdir(canonicalThemeRoot, { withFileTypes: true }))
      .filter((entry) => !entry.isSymbolicLink())
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, MAX_THEME_ENTRIES);

    for (const entry of entries) {
      try {
        const entryPath = path.join(canonicalThemeRoot, entry.name);
        const managedCustomPackage = entry.isDirectory() && entry.name === CUSTOM_THEME_DIRECTORY;
        const theme = entry.isFile() && entry.name.toLowerCase().endsWith(".css")
          ? await loadStandaloneCssTheme(canonicalThemeRoot, entry.name)
          : entry.isDirectory()
            ? await loadPackageTheme(entryPath, { managedCustomPackage })
            : null;
        if (!theme) continue;
        if (ids.has(theme.id)) {
          throw new TypeError(`Duplicate theme id: ${theme.id}.`);
        }
        ids.add(theme.id);
        themes.push(theme);
      } catch (error) {
        diagnostics.push(Object.freeze({
          source: entry.name,
          message: sanitizeError(error, canonicalThemeRoot),
        }));
      }
    }

    return Object.freeze({
      themes: Object.freeze(themes),
      diagnostics: Object.freeze(diagnostics),
    });
  };

  const openDirectory = async () => {
    await ensureRoot();
    const message = await shell.openPath(themeRoot);
    if (typeof message === "string" && message.length > 0) {
      throw new Error(`Unable to open the themes directory: ${message}`);
    }
    return Object.freeze({ opened: true });
  };

  const readCustomCss = async (target) => {
    requireThemeTarget(target);
    const canonicalThemeRoot = await ensureRoot();
    const packageRoot = await resolveManagedCustomPackage(canonicalThemeRoot, false);
    if (!packageRoot) return Object.freeze({ css: "" });
    const source = await resolvePackageFile(packageRoot, ".", `${target}.css`);
    return Object.freeze({
      css: await readBoundedText(source.absolutePath, MAX_CSS_BYTES, "Custom CSS"),
    });
  };

  const saveCustomCss = async (request) => {
    const target = request?.target;
    const css = request?.css;
    requireThemeTarget(target);
    if (typeof css !== "string" || Buffer.byteLength(css, "utf8") > MAX_CSS_BYTES) {
      throw new TypeError("Custom CSS exceeds the supported size limit.");
    }
    const operation = managedWriteQueue.then(async () => {
      const canonicalThemeRoot = await ensureRoot();
      const packageRoot = await ensureManagedCustomPackage(canonicalThemeRoot);
      await compileThemeFile({
        css,
        sourcePath: `${target}.css`,
        packageRoot,
        themeId: CUSTOM_THEME_ID,
        target,
        scope: "surface-overlay",
        budget: createCompilationBudget(),
      });
      await writeFileAtomic(packageRoot, `${target}.css`, css);
      return Object.freeze({ saved: true });
    });
    managedWriteQueue = operation.catch(() => undefined);
    return operation;
  };

  return Object.freeze({ listThemes, openDirectory, readCustomCss, saveCustomCss });
}

async function installThemeGuide({ bundledThemesPath, themeRoot }) {
  if (await pathEntryExists(path.join(themeRoot, THEME_GUIDE_MARKER))) return;
  await installBundledFileIfMissing({
    source: path.join(bundledThemesPath, THEME_GUIDE_README),
    destination: path.join(themeRoot, THEME_GUIDE_README),
  });
  await writeFileAtomic(themeRoot, THEME_GUIDE_MARKER, "1\n");
}

async function installBundledFileIfMissing({ source, destination }) {
  try {
    await writeFile(destination, await readFile(source), { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
}

async function pathEntryExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function ensureManagedCustomPackage(themeRoot) {
  const canonicalPackageRoot = await resolveManagedCustomPackage(themeRoot, true);
  await mkdir(path.join(canonicalPackageRoot, "assets"), { recursive: true });
  const manifest = JSON.stringify({
    schemaVersion: 1,
    id: CUSTOM_THEME_ID,
    name: "My Custom CSS",
    version: "1.0.0",
    author: "Local user",
    modes: ["light", "dark"],
    targets: themeTargets,
    entrypoints: Object.fromEntries(themeTargets.map((target) => [target, `${target}.css`])),
  }, null, 2);
  await writeFileAtomic(canonicalPackageRoot, "theme.json", `${manifest}\n`);
  await Promise.all(themeTargets.map(async (target) => {
    const filename = `${target}.css`;
    const filePath = path.join(canonicalPackageRoot, filename);
    try {
      await writeFile(filePath, "", { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }));
  return canonicalPackageRoot;
}

async function resolveManagedCustomPackage(canonicalThemeRoot, create) {
  const expectedPackageRoot = path.join(canonicalThemeRoot, CUSTOM_THEME_DIRECTORY);
  if (create) {
    await mkdir(expectedPackageRoot, { recursive: true });
  } else if (!await pathExists(expectedPackageRoot)) {
    return null;
  }
  const canonicalPackageRoot = await realpath(expectedPackageRoot);
  if (canonicalPackageRoot !== expectedPackageRoot) {
    throw new TypeError("The managed theme directory cannot be redirected through a symbolic link.");
  }
  return canonicalPackageRoot;
}

async function writeFileAtomic(directory, filename, content) {
  const tempPath = path.join(directory, `.${filename}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, content, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, path.join(directory, filename));
  } finally {
    await unlink(tempPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function requireThemeTarget(value) {
  if (!themeTargets.includes(value)) throw new TypeError("Custom CSS target is invalid.");
}

async function loadStandaloneCssTheme(themeRoot, filename) {
  const css = await readBoundedText(path.join(themeRoot, filename), MAX_CSS_BYTES, "Theme CSS");
  const descriptor = parseSingleFileThemeCss(css, { sourcePath: filename });
  if (descriptor) {
    if (descriptor.id === CUSTOM_THEME_ID) {
      throw new TypeError(`Theme id is reserved for managed Custom CSS: ${CUSTOM_THEME_ID}.`);
    }
    const budget = createCompilationBudget();
    const compiledCss = {};
    for (const target of descriptor.targets) {
      const compiled = await compileThemeFile({
        css: descriptor.stylesheets[target],
        sourcePath: filename,
        packageRoot: themeRoot,
        themeId: descriptor.id,
        target,
        budget,
      });
      compiledCss[target] = compiled.css;
    }
    return freezeTheme({
      id: descriptor.id,
      name: descriptor.name,
      version: descriptor.version,
      ...(descriptor.author ? { author: descriptor.author } : {}),
      modes: descriptor.modes,
      targets: descriptor.targets,
      source: "local-css",
      compiledCss,
    });
  }

  const slug = createSlug(path.basename(filename, path.extname(filename)));
  const id = `local.css.${slug}`;
  const budget = createCompilationBudget();
  const compiled = await compileThemeFile({
    css,
    sourcePath: filename,
    packageRoot: themeRoot,
    themeId: id,
    target: "markdown",
    budget,
  });
  return freezeTheme({
    id,
    name: humanizeFilename(filename),
    version: "0.0.0",
    modes: ["light", "dark"],
    targets: ["markdown"],
    source: "local-css",
    compiledCss: { markdown: compiled.css },
  });
}

async function loadPackageTheme(packageRoot, { managedCustomPackage = false } = {}) {
  const manifestFile = await resolvePackageFile(packageRoot, ".", "theme.json");
  const manifestText = await readBoundedText(
    manifestFile.absolutePath,
    MAX_MANIFEST_BYTES,
    "Theme manifest",
  );
  let value;
  try {
    value = JSON.parse(manifestText);
  } catch (error) {
    throw new TypeError(`Theme manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = parseThemeManifest(value);
  if (manifest.id === CUSTOM_THEME_ID && !managedCustomPackage) {
    throw new TypeError(`Theme id is reserved for managed Custom CSS: ${CUSTOM_THEME_ID}.`);
  }
  if (managedCustomPackage && manifest.id !== CUSTOM_THEME_ID) {
    throw new TypeError(`Managed Custom CSS must use the reserved theme id: ${CUSTOM_THEME_ID}.`);
  }
  const compiledCss = {};
  const budget = createCompilationBudget();
  for (const target of manifest.targets) {
    const entrypoint = await resolvePackageFile(packageRoot, ".", manifest.entrypoints[target]);
    const css = await readBoundedText(entrypoint.absolutePath, MAX_CSS_BYTES, "Theme CSS");
    const compiled = await compileThemeFile({
      css,
      sourcePath: entrypoint.relativePath,
      packageRoot,
      themeId: manifest.id,
      target,
      scope: managedCustomPackage ? "surface-overlay" : "theme",
      budget,
    });
    compiledCss[target] = compiled.css;
  }
  return freezeTheme({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.author ? { author: manifest.author } : {}),
    modes: manifest.modes,
    targets: manifest.targets,
    source: "local-package",
    compiledCss,
  });
}

async function compileThemeFile({
  css,
  sourcePath,
  packageRoot,
  themeId,
  target,
  budget,
  scope = "theme",
}) {
  reserveCssBytes(budget, css);
  const compiled = await compileThemeCss({
    css,
    sourcePath,
    themeId,
    target,
    scope,
    loadImport: async (specifier, importerPath) => {
      budget.importCount += 1;
      if (budget.importCount > MAX_THEME_IMPORTS) {
        throw new TypeError("Theme exceeds the aggregate import count limit.");
      }
      const resolved = await resolvePackageFile(packageRoot, importerPath, specifier);
      const importedCss = await readBoundedText(
        resolved.absolutePath,
        MAX_CSS_BYTES,
        "Theme CSS import",
      );
      reserveCssBytes(budget, importedCss);
      return {
        css: importedCss,
        sourcePath: resolved.relativePath,
      };
    },
    resolveAssetUrl: async (specifier, importerPath) => {
      const resolved = await resolvePackageFile(packageRoot, importerPath, specifier);
      const cached = budget.assetUrls.get(resolved.absolutePath);
      if (cached) {
        reserveEmbeddedAssetBytes(budget, cached);
        return cached;
      }
      const extension = path.extname(resolved.absolutePath).toLowerCase();
      const mimeType = assetMimeTypes.get(extension);
      if (!mimeType) throw new TypeError(`Unsupported theme asset type: ${extension || "unknown"}.`);
      const info = await stat(resolved.absolutePath);
      if (!info.isFile() || info.size > MAX_ASSET_BYTES) {
        throw new TypeError("Theme asset exceeds the supported size limit.");
      }
      budget.assetBytes += info.size;
      if (budget.assetBytes > MAX_THEME_ASSET_BYTES) {
        throw new TypeError("Theme exceeds the aggregate asset size limit.");
      }
      const bytes = await readFile(resolved.absolutePath);
      const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
      budget.assetUrls.set(resolved.absolutePath, dataUrl);
      reserveEmbeddedAssetBytes(budget, dataUrl);
      return dataUrl;
    },
  });
  budget.compiledBytes += Buffer.byteLength(compiled.css, "utf8");
  if (budget.compiledBytes > MAX_THEME_COMPILED_BYTES) {
    throw new TypeError("Theme exceeds the aggregate compiled CSS size limit.");
  }
  return compiled;
}

function createCompilationBudget() {
  return {
    assetBytes: 0,
    assetUrls: new Map(),
    compiledBytes: 0,
    cssBytes: 0,
    embeddedAssetBytes: 0,
    importCount: 0,
  };
}

function reserveCssBytes(budget, css) {
  budget.cssBytes += Buffer.byteLength(css, "utf8");
  if (budget.cssBytes > MAX_THEME_CSS_BYTES) {
    throw new TypeError("Theme exceeds the aggregate CSS size limit.");
  }
}

function reserveEmbeddedAssetBytes(budget, dataUrl) {
  budget.embeddedAssetBytes += Buffer.byteLength(dataUrl, "utf8");
  if (budget.embeddedAssetBytes > MAX_THEME_COMPILED_BYTES) {
    throw new TypeError("Theme exceeds the embedded asset expansion limit.");
  }
}

async function resolvePackageFile(packageRoot, importerPath, specifier) {
  const canonicalRoot = await realpath(packageRoot);
  const candidate = path.resolve(canonicalRoot, path.dirname(importerPath), specifier);
  requireContainedPath(canonicalRoot, candidate);
  const canonical = await realpath(candidate);
  requireContainedPath(canonicalRoot, canonical);
  return {
    absolutePath: canonical,
    relativePath: path.relative(canonicalRoot, canonical).split(path.sep).join("/"),
  };
}

function requireContainedPath(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TypeError("Theme resource path escapes its package.");
  }
}

async function readBoundedText(filePath, maxBytes, label) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size > maxBytes) {
    throw new TypeError(`${label} exceeds the supported size limit.`);
  }
  return readFile(filePath, "utf8");
}

function freezeTheme(theme) {
  return Object.freeze({
    ...theme,
    modes: Object.freeze([...theme.modes]),
    targets: Object.freeze([...theme.targets]),
    compiledCss: Object.freeze({ ...theme.compiledCss }),
  });
}

function createSlug(value) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!slug) return "theme";
  return /^[a-z]/.test(slug) ? slug : `theme-${slug}`;
}

function humanizeFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Theme";
}

function sanitizeError(error, themeRoot) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(themeRoot, "<themes>").slice(0, 500);
}

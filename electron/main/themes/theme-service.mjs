import path from "node:path";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { compileThemeCss } from "./theme-css-compiler.mjs";
import { parseThemeManifest } from "./theme-package-contract.mjs";

const MAX_THEME_ENTRIES = 200;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_CSS_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_THEME_CSS_BYTES = 4 * 1024 * 1024;
const MAX_THEME_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_THEME_COMPILED_BYTES = 16 * 1024 * 1024;
const MAX_THEME_IMPORTS = 64;
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

export function createThemeService({ userDataPath, shell }) {
  if (typeof userDataPath !== "string" || userDataPath.trim().length === 0) {
    throw new TypeError("A userData path is required for the theme service.");
  }
  if (!shell || typeof shell.openPath !== "function") {
    throw new TypeError("Electron shell.openPath is required for the theme service.");
  }
  const themeRoot = path.join(path.resolve(userDataPath), "themes");

  const ensureRoot = async () => {
    await mkdir(themeRoot, { recursive: true });
    return themeRoot;
  };

  const listThemes = async () => {
    await ensureRoot();
    const themes = [];
    const diagnostics = [];
    const ids = new Set();
    const entries = (await readdir(themeRoot, { withFileTypes: true }))
      .filter((entry) => !entry.isSymbolicLink())
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, MAX_THEME_ENTRIES);

    for (const entry of entries) {
      try {
        const theme = entry.isFile() && entry.name.toLowerCase().endsWith(".css")
          ? await loadStandaloneCssTheme(themeRoot, entry.name)
          : entry.isDirectory()
            ? await loadPackageTheme(path.join(themeRoot, entry.name))
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
          message: sanitizeError(error, themeRoot),
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

  return Object.freeze({ listThemes, openDirectory });
}

async function loadStandaloneCssTheme(themeRoot, filename) {
  const slug = createSlug(path.basename(filename, path.extname(filename)));
  const id = `local.css.${slug}`;
  const css = await readBoundedText(path.join(themeRoot, filename), MAX_CSS_BYTES, "Theme CSS");
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

async function loadPackageTheme(packageRoot) {
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

async function compileThemeFile({ css, sourcePath, packageRoot, themeId, target, budget }) {
  reserveCssBytes(budget, css);
  const compiled = await compileThemeCss({
    css,
    sourcePath,
    themeId,
    target,
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

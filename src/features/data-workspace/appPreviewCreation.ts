import type { DataNode, DataPort } from "@puppyone/shared-ui";
import { normalizeAppPreviewManifest } from "../../../shared/appPreviewManifest.js";

const MAX_CHILD_DIRECTORIES = 24;
const MAX_SCRIPTS_PER_PROJECT = 8;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".output",
  ".turbo",
  "build",
  "dist",
  "node_modules",
  "out",
]);
const SCRIPT_PRIORITY = new Map([
  ["dev", 100],
  ["start", 85],
  ["serve", 75],
  ["slidev", 72],
  ["preview", 55],
]);

export type AppPreviewPackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type AppPreviewFramework =
  | "Slidev"
  | "Vite"
  | "Next.js"
  | "Astro"
  | "Create React App"
  | "Webpack"
  | "Parcel"
  | "Web app";

export type AppPreviewProjectCandidate = Readonly<{
  id: string;
  cwd: string;
  directoryLabel: string;
  script: string;
  packageManager: AppPreviewPackageManager;
  framework: AppPreviewFramework;
  command: readonly string[];
  commandLabel: string;
  score: number;
}>;

export type AppPreviewCreationDraft = Readonly<{
  detectionStatus: "loading" | "ready" | "empty" | "error";
  candidates: readonly AppPreviewProjectCandidate[];
  selectedCandidateId: string | null;
  cwd: string;
  commandText: string;
  advanced: boolean;
  configurationTouched: boolean;
}>;

export type AppPreviewCreationConfig = Readonly<{
  name: string;
  cwd: string;
  command: readonly string[];
}>;

export class AppPreviewCreationError extends Error {
  constructor(
    message: string,
    readonly code: "command-required" | "command-invalid" | "cwd-invalid",
  ) {
    super(message);
    this.name = "AppPreviewCreationError";
  }
}

export function createInitialAppPreviewDraft(): AppPreviewCreationDraft {
  const command = createPackageScriptCommand("npm", "dev", "Web app");
  return {
    detectionStatus: "loading",
    candidates: [],
    selectedCandidateId: null,
    cwd: ".",
    commandText: formatAppPreviewCommand(command),
    advanced: false,
    configurationTouched: false,
  };
}

export function applyAppPreviewDetection(
  current: AppPreviewCreationDraft,
  candidates: readonly AppPreviewProjectCandidate[],
): AppPreviewCreationDraft {
  const selected = candidates.find((candidate) => candidate.id === current.selectedCandidateId)
    ?? candidates[0]
    ?? null;
  if (!selected || current.configurationTouched) {
    return {
      ...current,
      detectionStatus: candidates.length > 0 ? "ready" : "empty",
      candidates,
      selectedCandidateId: selected?.id ?? null,
      advanced: candidates.length === 0 ? true : current.advanced,
    };
  }
  return selectAppPreviewCandidate({
    ...current,
    detectionStatus: "ready",
    candidates,
  }, selected.id, false);
}

export function selectAppPreviewCandidate(
  current: AppPreviewCreationDraft,
  candidateId: string,
  configurationTouched = true,
): AppPreviewCreationDraft {
  const candidate = current.candidates.find((item) => item.id === candidateId);
  if (!candidate) return current;
  return {
    ...current,
    selectedCandidateId: candidate.id,
    cwd: candidate.cwd,
    commandText: formatAppPreviewCommand(candidate.command),
    configurationTouched,
  };
}

export async function detectAppPreviewProjects(
  dataPort: Pick<DataPort, "listChildren" | "readFile">,
  parentPath: string | null,
): Promise<AppPreviewProjectCandidate[]> {
  if (!dataPort.readFile) return [];
  const rootChildren = await safeListChildren(dataPort, parentPath);
  const directories = [
    { path: parentPath, cwd: ".", label: getDirectoryLabel(parentPath) },
    ...rootChildren
      .filter(isScannableDirectory)
      .slice(0, MAX_CHILD_DIRECTORIES)
      .map((node) => ({ path: node.path, cwd: node.name, label: node.name })),
  ];
  const candidates = await Promise.all(directories.map(async (directory, directoryIndex) => {
    const children = directoryIndex === 0
      ? rootChildren
      : await safeListChildren(dataPort, directory.path);
    const packageNode = children.find((node) => node.type !== "folder" && node.name === "package.json");
    if (!packageNode) return [];
    const packageContent = await dataPort.readFile?.(packageNode.path).catch(() => null);
    const packageManifest = parsePackageManifest(packageContent?.content);
    if (!packageManifest) return [];
    const packageManager = detectPackageManager(children);
    const framework = detectFramework(packageManifest);
    const scripts = Object.entries(packageManifest.scripts)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))
      .sort(([left], [right]) => scoreScript(right) - scoreScript(left) || left.localeCompare(right))
      .slice(0, MAX_SCRIPTS_PER_PROJECT);
    return scripts.map(([script, scriptBody]) => {
      const detectedFramework = detectScriptFramework(framework, scriptBody);
      const command = createPackageScriptCommand(packageManager, script, detectedFramework);
      return {
        id: `${directory.cwd}\n${packageManager}\n${script}`,
        cwd: directory.cwd,
        directoryLabel: directory.label,
        script,
        packageManager,
        framework: detectedFramework,
        command,
        commandLabel: formatAppPreviewCommand(command),
        score: scoreScript(script) + scoreFramework(detectedFramework) + (directoryIndex === 0 ? 30 : 0),
      } satisfies AppPreviewProjectCandidate;
    });
  }));
  return candidates.flat().sort((left, right) => (
    right.score - left.score ||
    left.directoryLabel.localeCompare(right.directoryLabel) ||
    left.script.localeCompare(right.script)
  ));
}

export function createAppPreviewManifestContent(config: AppPreviewCreationConfig): string {
  const manifest = normalizeAppPreviewManifest({
    type: "puppyone.app",
    version: 1,
    name: config.name,
    launch: {
      kind: "local-server",
      command: [...config.command],
      cwd: config.cwd,
      env: {
        HOST: "127.0.0.1",
        PORT: "${port}",
      },
      url: "http://127.0.0.1:${port}/",
      health: {
        path: "/",
        expectStatus: 200,
      },
    },
    permissions: {
      workspace: ["read"],
    },
  });
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function parseAppPreviewCommandLine(value: string): string[] {
  const input = value.trim();
  if (!input) throw new AppPreviewCreationError("A start command is required.", "command-required");
  if (input.includes("\0") || input.includes("\n") || input.includes("\r")) {
    throw new AppPreviewCreationError("The start command contains unsupported characters.", "command-invalid");
  }
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;
  let tokenStarted = false;
  for (const character of input) {
    if (escaping) {
      current += character;
      escaping = false;
      tokenStarted = true;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaping = true;
      tokenStarted = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      tokenStarted = true;
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (tokenStarted) {
        parts.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += character;
    tokenStarted = true;
  }
  if (escaping || quote) {
    throw new AppPreviewCreationError("The start command has an unfinished quote or escape.", "command-invalid");
  }
  if (tokenStarted) parts.push(current);
  if (parts.length === 0 || parts.some((part) => !part || part.includes("\0"))) {
    throw new AppPreviewCreationError("The start command is invalid.", "command-invalid");
  }
  return parts;
}

export function formatAppPreviewCommand(command: readonly string[]): string {
  return command.map((part) => {
    if (/^[A-Za-z0-9_./:@${}=+-]+$/.test(part)) return part;
    return `"${part.replace(/(["\\])/g, "\\$1")}"`;
  }).join(" ");
}

export function normalizeAppPreviewWorkingDirectory(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("\0")
  ) {
    throw new AppPreviewCreationError("The working directory must stay inside this folder.", "cwd-invalid");
  }
  return normalized;
}

function createPackageScriptCommand(
  packageManager: AppPreviewPackageManager,
  script: string,
  framework: AppPreviewFramework,
): string[] {
  const frameworkArguments = getFrameworkArguments(framework);
  const separator = frameworkArguments.length > 0 && packageManager !== "yarn" ? ["--"] : [];
  return [
    packageManager,
    "run",
    script,
    ...separator,
    ...frameworkArguments,
  ];
}

function getFrameworkArguments(framework: AppPreviewFramework): string[] {
  if (framework === "Next.js") {
    return ["--hostname", "127.0.0.1", "--port", "${port}"];
  }
  if (["Slidev", "Vite", "Astro", "Webpack", "Parcel"].includes(framework)) {
    return ["--host", "127.0.0.1", "--port", "${port}"];
  }
  return [];
}

function parsePackageManifest(content: string | null | undefined): {
  scripts: Record<string, unknown>;
  dependencies: Record<string, unknown>;
} | null {
  try {
    const value = JSON.parse(content ?? "") as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return {
      scripts: isRecord(value.scripts) ? value.scripts : {},
      dependencies: {
        ...(isRecord(value.dependencies) ? value.dependencies : {}),
        ...(isRecord(value.devDependencies) ? value.devDependencies : {}),
      },
    };
  } catch {
    return null;
  }
}

function detectFramework(manifest: { dependencies: Record<string, unknown> }): AppPreviewFramework {
  const dependencies = manifest.dependencies;
  if ("@slidev/cli" in dependencies) return "Slidev";
  if ("next" in dependencies) return "Next.js";
  if ("astro" in dependencies) return "Astro";
  if ("vite" in dependencies) return "Vite";
  if ("react-scripts" in dependencies) return "Create React App";
  if ("webpack-dev-server" in dependencies || "webpack" in dependencies) return "Webpack";
  if ("parcel" in dependencies) return "Parcel";
  return "Web app";
}

function detectScriptFramework(
  packageFramework: AppPreviewFramework,
  script: string,
): AppPreviewFramework {
  const normalized = script.toLowerCase();
  if (/(^|\s)slidev(?:\s|$)/.test(normalized)) return "Slidev";
  if (/(^|\s)next(?:\s|$)/.test(normalized)) return "Next.js";
  if (/(^|\s)astro(?:\s|$)/.test(normalized)) return "Astro";
  if (/(^|\s)vite(?:\s|$)/.test(normalized)) return "Vite";
  if (/(^|\s)react-scripts(?:\s|$)/.test(normalized)) return "Create React App";
  if (/(^|\s)webpack(?:\s|$)/.test(normalized)) return "Webpack";
  if (/(^|\s)parcel(?:\s|$)/.test(normalized)) return "Parcel";
  return packageFramework;
}

function detectPackageManager(children: readonly DataNode[]): AppPreviewPackageManager {
  const names = new Set(children.map((node) => node.name));
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("bun.lock") || names.has("bun.lockb")) return "bun";
  return "npm";
}

function scoreScript(script: string): number {
  return SCRIPT_PRIORITY.get(script.toLowerCase()) ?? 20;
}

function scoreFramework(framework: AppPreviewFramework): number {
  return framework === "Web app" ? 0 : 20;
}

function isScannableDirectory(node: DataNode): boolean {
  return node.type === "folder" && !node.name.startsWith(".") && !IGNORED_DIRECTORIES.has(node.name);
}

async function safeListChildren(
  dataPort: Pick<DataPort, "listChildren">,
  path: string | null,
): Promise<DataNode[]> {
  return dataPort.listChildren(path).catch(() => []);
}

function getDirectoryLabel(path: string | null): string {
  if (!path) return ".";
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) ?? ".";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

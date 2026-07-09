import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(repoRoot, "dist", "assets");
const entryChunkBudgetBytes = 2_100_000;
const heavyChunks = [
  {
    label: "docx-preview",
    chunkPattern: /^docx-preview-.+\.js$/,
    entryLeakPattern: /schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/officeDocument/,
  },
  {
    label: "jszip",
    chunkPattern: /^jszip(?:\.min)?-.+\.js$/,
    entryLeakPattern: /\b(?:function JSZip|JSZip\.support|JSZip\.defaults)\b/,
  },
  {
    label: "xlsx",
    chunkPattern: /^xlsx-.+\.js$/,
    entryLeakPattern: /\bSheetJS\b/,
  },
  {
    label: "mermaid",
    chunkPattern: /^mermaid\.core-.+\.js$/,
    entryLeakPattern: /\bmermaidAPI\b/,
  },
];

const files = readdirSync(assetsDir);
const entryChunks = files.filter((fileName) => /^index-.+\.js$/.test(fileName));

if (entryChunks.length !== 1) {
  fail(`expected exactly one renderer entry chunk, found ${entryChunks.length}`);
}

const entryChunk = entryChunks[0];
const entryPath = path.join(assetsDir, entryChunk);
const entrySize = statSync(entryPath).size;
const entrySource = readFileSync(entryPath, "utf8");
const errors = [];

if (entrySize > entryChunkBudgetBytes) {
  errors.push(
    `${entryChunk} is ${formatBytes(entrySize)}, above the ${formatBytes(entryChunkBudgetBytes)} entry chunk budget`,
  );
}

for (const heavyChunk of heavyChunks) {
  if (!files.some((fileName) => heavyChunk.chunkPattern.test(fileName))) {
    errors.push(`${heavyChunk.label} did not build as a separate lazy chunk`);
  }
  if (heavyChunk.entryLeakPattern.test(entrySource)) {
    errors.push(`${heavyChunk.label} implementation leaked into ${entryChunk}`);
  }
}

if (errors.length > 0) {
  console.error("bundle budget check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`bundle budget check passed: ${entryChunk} is ${formatBytes(entrySize)}.`);

function fail(message) {
  console.error(`bundle budget check failed: ${message}`);
  process.exit(1);
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

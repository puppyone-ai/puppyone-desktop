import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commit = "7d7cc84c60a77431aaccda7ff49a2f1f4ae1c2ab";
const license = read("vendor/claudian/LICENSE");
const ledger = read("vendor/claudian/SOURCE_ADOPTION.md");
const notice = read("THIRD_PARTY_NOTICES.md");
const css = read("src/features/desktop-agent/ui/desktop-agent.css");
const packageManifest = JSON.parse(read("package.json"));
const sbom = JSON.parse(read("vendor/claudian/SBOM.cdx.json"));

assert(license.includes("MIT License") && license.includes("Copyright (c) 2025"), "Claudian MIT license is incomplete.");
assert(
  ledger.includes(commit)
    && ledger.includes("frontend")
    && ledger.includes("multi-native")
    && ledger.includes("ADR-005"),
  "Claudian source ledger is incomplete or does not name the current Agent architecture boundary.",
);
assert(notice.includes(commit) && notice.includes("vendor/claudian/LICENSE"), "Claudian third-party notice is incomplete.");
assert(css.includes(commit) && css.includes("vendor/claudian/SOURCE_ADOPTION.md"), "Agent UI source provenance comment is missing.");
assert(packageManifest.build?.files?.includes("vendor/claudian/**"), "Packaged application omits the Claudian license ledger.");
assert(sbom.bomFormat === "CycloneDX" && sbom.components?.[0]?.version === commit, "Claudian SBOM is missing or drifted.");
assert(sbom.components?.[0]?.properties?.some((entry) => entry.name === "puppyone:runtime-code-included" && entry.value === "false"), "Claudian SBOM adoption boundary is missing.");

const vendorFiles = fs.readdirSync(path.join(root, "vendor/claudian")).sort();
assert(JSON.stringify(vendorFiles) === JSON.stringify(["LICENSE", "SBOM.cdx.json", "SOURCE_ADOPTION.md"]), "Claudian vendor directory must contain provenance only, not runtime code or assets.");

process.stdout.write("Agent UI provenance check passed.\n");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

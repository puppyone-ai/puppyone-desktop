const required = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

const missing = required.filter((name) => !String(process.env[name] ?? "").trim());
if (missing.length) {
  console.error(`Refusing to create an unsigned or unnotarized macOS release. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const updateUrl = "https://updates.puppyone.ai/desktop/stable/mac";
if (!updateUrl.startsWith("https://")) {
  console.error("The stable update feed must use HTTPS.");
  process.exit(1);
}

console.log("macOS signing and notarization credentials are present.");

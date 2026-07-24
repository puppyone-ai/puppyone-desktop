export function buildCodexTurnInput(prompt, references = []) {
  const input = [{ type: "text", text: prompt, text_elements: [] }];
  const seen = new Set();
  for (const reference of Array.isArray(references) ? references : []) {
    if (!reference || typeof reference.path !== "string" || reference.path.length === 0) {
      throw new Error("Codex received an invalid reference input.");
    }
    if (seen.has(reference.path)) continue;
    seen.add(reference.path);
    if (reference.kind === "workspace-entry") {
      input.push({
        type: "mention",
        name: reference.displayName || reference.name || "workspace item",
        path: reference.path,
      });
      continue;
    }
    if (reference.kind === "staged-attachment" && typeof reference.mime === "string" && reference.mime.startsWith("image/")) {
      input.push({ type: "localImage", path: reference.path });
      continue;
    }
    throw new Error("Codex does not support this reference input type.");
  }
  return input;
}

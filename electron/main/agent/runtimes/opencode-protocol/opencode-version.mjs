export function parseOpenCodeVersion(value) {
  for (const line of String(value).split(/\r?\n/)) {
    const match = line.trim().match(/^(?:opencode(?:\s+version)?\s+)?v?(\d+\.\d+\.\d+)$/i);
    if (match) return match[1];
  }
  return null;
}

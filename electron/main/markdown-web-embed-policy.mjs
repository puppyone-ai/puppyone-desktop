/**
 * Policy for markdown web embeds loaded in the main process.
 * Only unconditionally public, https-only URLs with no userinfo and no
 * private/loopback hosts are permitted.
 */

function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::" || /^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) {
    return true;
  }

  const octets = host.split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return false;
  const values = octets.map(Number);
  if (values.some((value) => value > 255)) return true;
  return (
    values[0] === 0 ||
    values[0] === 10 ||
    values[0] === 127 ||
    (values[0] === 169 && values[1] === 254) ||
    (values[0] === 172 && values[1] >= 16 && values[1] <= 31) ||
    (values[0] === 192 && values[1] === 168)
  );
}

export function assertMarkdownWebEmbedHref(href) {
  if (typeof href !== "string") {
    throw new Error("Markdown web embed href must be a string.");
  }

  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error("Markdown web embed href is not a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only https:// embeds are allowed.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Markdown web embed URLs must not contain credentials.");
  }

  const hostname = parsed.hostname;
  if (!hostname || isPrivateHost(hostname)) {
    throw new Error("Markdown web embed URLs must not target private or loopback hosts.");
  }

  return parsed.href;
}

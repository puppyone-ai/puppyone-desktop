import { isIP } from "node:net";

/**
 * Network policy for Markdown web embeds.
 *
 * Syntax checks alone are not enough for remote content: a public-looking
 * hostname can resolve to loopback/private space. Callers must therefore run
 * both `assertMarkdownWebEmbedHref` and
 * `assertMarkdownWebEmbedNetworkTarget` before a request is allowed.
 */

const LOCAL_HOST_SUFFIXES = [".localhost", ".local", ".home.arpa"];

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

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || isLocalHostname(hostname)) {
    throw new Error("Markdown web embed URLs must not target private or loopback hosts.");
  }

  if (isIP(hostname) !== 0 && !isPublicIpAddress(hostname)) {
    throw new Error("Markdown web embed URLs must not target private or loopback hosts.");
  }

  return parsed.href;
}

/**
 * Resolve a canonical embed URL in the same Chromium Session that will load
 * it, and reject the request unless every returned endpoint is public.
 */
export async function assertMarkdownWebEmbedNetworkTarget(href, resolveHost) {
  const canonicalHref = assertMarkdownWebEmbedHref(href);
  const parsed = new URL(canonicalHref);
  const hostname = normalizeHostname(parsed.hostname);

  if (isIP(hostname) !== 0) {
    if (!isPublicIpAddress(hostname)) {
      throw new Error("Markdown web embed target resolved to a non-public address.");
    }
    return canonicalHref;
  }

  if (typeof resolveHost !== "function") {
    throw new Error("Markdown web embed DNS resolver is unavailable.");
  }

  let result;
  try {
    result = await resolveHost(hostname, {
      cacheUsage: "allowed",
      secureDnsPolicy: "allow",
    });
  } catch {
    throw new Error("Markdown web embed host could not be resolved safely.");
  }

  const endpoints = Array.isArray(result) ? result : result?.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    throw new Error("Markdown web embed host did not resolve to a public address.");
  }

  for (const endpoint of endpoints) {
    const address = typeof endpoint === "string" ? endpoint : endpoint?.address;
    if (typeof address !== "string" || !isPublicIpAddress(address)) {
      throw new Error("Markdown web embed target resolved to a non-public address.");
    }
  }

  return canonicalHref;
}

export function isPublicIpAddress(address) {
  const normalized = normalizeIpAddress(address);
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;

  const words = parseIpv6Words(normalized);
  if (!words) return false;

  // IPv4-mapped and deprecated IPv4-compatible IPv6 forms inherit the IPv4
  // address policy. This closes ::ffff:127.0.0.1-style loopback bypasses.
  const isMapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const isCompatible = words.slice(0, 6).every((word) => word === 0);
  if (isMapped || isCompatible) {
    const embedded = `${words[6] >>> 8}.${words[6] & 0xff}.${words[7] >>> 8}.${words[7] & 0xff}`;
    return isPublicIpv4(embedded);
  }

  // Only globally routed unicast space is eligible. Then remove transition
  // and documentation ranges that sit inside 2000::/3 but are not safe public
  // destinations for an embedded browser.
  if ((words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false; // documentation
  if (words[0] === 0x2001 && words[1] === 0x0000) return false; // Teredo
  if (words[0] === 0x2001 && words[1] === 0x0002) return false; // benchmarking
  if (words[0] === 0x2002) return false; // 6to4 transition space
  return true;
}

function normalizeHostname(hostname) {
  return String(hostname ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

function normalizeIpAddress(address) {
  return String(address ?? "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/%.+$/, "")
    .toLowerCase();
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || LOCAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isPublicIpv4(address) {
  const values = address.split(".").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }

  const [a, b, c] = values;
  return !(
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6Words(address) {
  let value = address;
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = value.slice(lastColon + 1);
    if (!isIP(ipv4)) return null;
    const octets = ipv4.split(".").map(Number);
    value = `${value.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const parts = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

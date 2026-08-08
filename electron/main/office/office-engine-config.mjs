export function loadOfficeEngineConfiguration(environment = process.env) {
  const documentServerUrl = normalizeHttpOrigin(environment.PUPPYONE_OFFICE_DOCUMENT_SERVER_URL);
  const jwtSecret = normalizeSecret(environment.PUPPYONE_OFFICE_JWT_SECRET);
  const bindHost = normalizeBindHost(environment.PUPPYONE_OFFICE_BRIDGE_BIND_HOST);
  const bindPort = normalizePort(environment.PUPPYONE_OFFICE_BRIDGE_PORT);
  const publicUrl = normalizePublicUrl(environment.PUPPYONE_OFFICE_BRIDGE_PUBLIC_URL);
  const downloadOrigins = new Set(
    String(environment.PUPPYONE_OFFICE_DOWNLOAD_ORIGINS ?? "")
      .split(",")
      .map((value) => normalizeHttpOrigin(value))
      .filter(Boolean),
  );
  if (documentServerUrl) downloadOrigins.add(new URL(documentServerUrl).origin);

  const reason = !documentServerUrl
    ? "PUPPYONE_OFFICE_DOCUMENT_SERVER_URL is not configured."
    : !jwtSecret
      ? "PUPPYONE_OFFICE_JWT_SECRET must contain at least 16 characters."
      : null;
  return Object.freeze({
    configured: reason === null,
    reason,
    documentServerUrl,
    jwtSecret,
    bindHost,
    bindPort,
    publicUrl,
    downloadOrigins,
  });
}

function normalizeHttpOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizeSecret(value) {
  return typeof value === "string" && value.length >= 16 ? value : null;
}

function normalizeBindHost(value) {
  return typeof value === "string" && /^[a-zA-Z0-9.:-]+$/.test(value) ? value : "127.0.0.1";
}

function normalizePort(value) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : 0;
}

function normalizePublicUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();
  const probe = candidate.replaceAll("{port}", "1");
  try {
    const url = new URL(probe);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? candidate.replace(/\/$/, "")
      : null;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

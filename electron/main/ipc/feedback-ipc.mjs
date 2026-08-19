const DEFAULT_FEEDBACK_ENDPOINT = "https://formspree.io/f/mlgqvydy";
const MAX_FEEDBACK_LENGTH = 2_000;
const MAX_CONTACT_EMAIL_LENGTH = 254;
const MAX_LOCALE_LENGTH = 80;
const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const FEEDBACK_TIMEOUT_MS = 15_000;
const SCREENSHOT_FILENAMES = new Map([
  ["image/jpeg", "feedback-screenshot.jpg"],
  ["image/png", "feedback-screenshot.png"],
  ["image/webp", "feedback-screenshot.webp"],
]);

export function registerFeedbackIpcHandlers({
  ipcMain,
  appVersion,
  fetchImpl = globalThis.fetch,
  platform = process.platform,
  endpoint = process.env.PUPPYONE_FEEDBACK_ENDPOINT || DEFAULT_FEEDBACK_ENDPOINT,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Feedback submission requires a fetch implementation.");
  }

  const feedbackEndpoint = requireFeedbackEndpoint(endpoint);

  ipcMain.handle("feedback:submit", async (_event, request) => {
    const message = typeof request?.message === "string" ? request.message.trim() : "";
    const email = parseContactEmail(request?.email);
    const locale = typeof request?.locale === "string"
      ? request.locale.trim().slice(0, MAX_LOCALE_LENGTH)
      : "";
    const screenshot = parseScreenshot(request?.screenshot);

    if (message.length > MAX_FEEDBACK_LENGTH) {
      throw new Error("Feedback cannot exceed 2000 characters.");
    }
    if (!message) {
      throw new Error("Feedback requires a message.");
    }
    if (!email) {
      throw new Error("Feedback requires a valid contact email.");
    }

    const normalizedAppVersion = normalizeContextValue(appVersion);
    const body = new FormData();
    body.set("message", message);
    body.set("email", email);
    body.set("appVersion", normalizedAppVersion);
    body.set("locale", locale);
    body.set("platform", normalizeContextValue(platform));
    body.set("source", "PuppyOne Desktop");
    body.set(
      "subject",
      `PuppyOne Desktop Feedback · v${normalizedAppVersion || "unknown"}`,
    );
    body.set("timestamp", new Date().toISOString());
    body.set("_gotcha", "");
    if (screenshot) {
      body.set(
        "attachment",
        new Blob([screenshot.bytes], { type: screenshot.mimeType }),
        SCREENSHOT_FILENAMES.get(screenshot.mimeType),
      );
    }

    let response;
    try {
      response = await fetchImpl(feedbackEndpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          "user-agent": `puppyone-desktop/${normalizeContextValue(appVersion) || "unknown"}`,
        },
        body,
        signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
      });
    } catch {
      throw new Error("The feedback service is unavailable.");
    }

    if (!response.ok) {
      throw new Error("The feedback service could not accept this message.");
    }

    return { ok: true };
  });
}

function parseContactEmail(value) {
  const email = typeof value === "string" ? value.trim() : "";
  return email.length > 0
    && email.length <= MAX_CONTACT_EMAIL_LENGTH
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ? email
    : null;
}

function normalizeContextValue(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function parseScreenshot(value) {
  if (value == null) return null;

  const mimeType = typeof value?.mimeType === "string"
    ? value.mimeType.trim().toLowerCase()
    : "";
  const filename = SCREENSHOT_FILENAMES.get(mimeType);
  if (!filename) {
    throw new Error("Screenshot must be a PNG, JPEG, or WebP image.");
  }

  let sourceBytes;
  if (value.bytes instanceof ArrayBuffer) {
    sourceBytes = new Uint8Array(value.bytes);
  } else if (ArrayBuffer.isView(value.bytes)) {
    sourceBytes = new Uint8Array(
      value.bytes.buffer,
      value.bytes.byteOffset,
      value.bytes.byteLength,
    );
  } else {
    throw new Error("Screenshot data is invalid.");
  }

  if (sourceBytes.byteLength === 0 || sourceBytes.byteLength > MAX_SCREENSHOT_BYTES) {
    throw new Error("Screenshot must be smaller than 3 MB.");
  }

  const bytes = new Uint8Array(sourceBytes);
  if (!hasExpectedImageSignature(bytes, mimeType)) {
    throw new Error("Screenshot data does not match its image type.");
  }

  return { bytes, mimeType };
}

function hasExpectedImageSignature(bytes, mimeType) {
  if (mimeType === "image/png") {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === "image/jpeg") {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  }
  return (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytes.length >= 12
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  );
}

function startsWithBytes(bytes, signature) {
  return bytes.length >= signature.length
    && signature.every((value, index) => bytes[index] === value);
}

function requireFeedbackEndpoint(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("PUPPYONE_FEEDBACK_ENDPOINT must be a valid URL.");
  }

  const localHttp =
    url.protocol === "http:"
    && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("The feedback endpoint must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("The feedback endpoint cannot contain credentials.");
  }

  return url.toString();
}

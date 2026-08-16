export function requireSafeExternalUrl(value) {
  if (
    typeof value !== "string"
    || /[\u0000-\u001f\u007f]/.test(value)
    || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
  ) {
    throw new Error("External URL contains control characters.");
  }
  const rawUrl = value.trim();
  if (!rawUrl) throw new Error("External URL is required.");

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("External URL is invalid.");
  }

  if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
    throw new Error("External URL protocol is not allowed.");
  }
  if (
    (url.protocol === "http:" || url.protocol === "https:")
    && (!url.hostname || url.username || url.password)
  ) {
    throw new Error("External web URL host or credentials are not allowed.");
  }
  if (url.protocol === "mailto:" && !url.pathname) {
    throw new Error("External mail URL must include a recipient.");
  }

  return url.toString();
}

/**
 * The single Main-process authority for handing a web navigation intent to
 * the operating system. Renderers and embedded WebContents never receive the
 * Electron shell and cannot widen the accepted protocol set.
 */
export function createExternalNavigationService({ shell, logger = console }) {
  if (!shell || typeof shell.openExternal !== "function") {
    throw new TypeError("External navigation requires an Electron shell opener.");
  }

  const open = async (href) => {
    const url = requireSafeExternalUrl(href);
    await shell.openExternal(url);
    return { ok: true, url };
  };

  const openDetached = (href) => {
    let url;
    try {
      url = requireSafeExternalUrl(href);
    } catch {
      return false;
    }

    try {
      Promise.resolve(shell.openExternal(url)).catch((error) => {
        logger.warn("Unable to open external navigation target:", error);
      });
    } catch (error) {
      logger.warn("Unable to open external navigation target:", error);
      return false;
    }
    return true;
  };

  return Object.freeze({ open, openDetached });
}

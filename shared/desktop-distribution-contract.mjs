export const DESKTOP_RELEASE_BUCKET = "puppyone-desktop";
export const DESKTOP_PUBLIC_DOWNLOAD_ORIGIN = "https://downloads.puppyone.ai";
export const DESKTOP_STABLE_UPDATE_ORIGIN = "https://updates.puppyone.ai";

export const DESKTOP_INTERNAL_UPDATE_FEED_URL = joinOriginPath(
  DESKTOP_PUBLIC_DOWNLOAD_ORIGIN,
  "/desktop/internal/mac/latest",
);
export const DESKTOP_STABLE_UPDATE_FEED_URL = joinOriginPath(
  DESKTOP_STABLE_UPDATE_ORIGIN,
  "/desktop/stable/mac/latest",
);
export const DESKTOP_STABLE_LATEST_POINTER_URL = joinOriginPath(
  DESKTOP_PUBLIC_DOWNLOAD_ORIGIN,
  "/desktop/stable/mac/latest/latest.json",
);
export const DESKTOP_STABLE_UPDATE_METADATA_NAME = "stable-mac.yml";

// Every feed embedded in a shipped Stable application remains a compatibility
// endpoint. Future migrations append a contract; they never replace an entry.
export const DESKTOP_SHIPPED_STABLE_UPDATE_CONTRACTS = Object.freeze([
  Object.freeze({
    feedUrl: DESKTOP_STABLE_UPDATE_FEED_URL,
    introducedInVersion: "0.1.4",
  }),
]);

export const DESKTOP_SUPPORTED_STABLE_UPDATE_FEED_URLS = Object.freeze(
  DESKTOP_SHIPPED_STABLE_UPDATE_CONTRACTS.map(({ feedUrl }) => feedUrl),
);

function joinOriginPath(origin, pathname) {
  const url = new URL(pathname, `${origin}/`);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error(`Invalid Desktop distribution URL: ${url.href}`);
  }
  return url.href.replace(/\/+$/, "");
}

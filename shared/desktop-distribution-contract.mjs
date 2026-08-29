import {
  DESKTOP_SHIPPED_STABLE_UPDATE_CONTRACTS as PLATFORM_STABLE_UPDATE_CONTRACTS,
} from "./desktop/distribution-contract.mjs";

export {
  DESKTOP_INTERNAL_UPDATE_FEED_URL,
  DESKTOP_PUBLIC_DOWNLOAD_ORIGIN,
  DESKTOP_RELEASE_BUCKET,
  DESKTOP_STABLE_LATEST_POINTER_URL,
  DESKTOP_STABLE_UPDATE_METADATA_NAME,
  DESKTOP_STABLE_UPDATE_ORIGIN,
  DESKTOP_STABLE_UPDATE_FEED_URL,
  DESKTOP_UPDATE_TRACK_BY_PLATFORM,
  createDesktopDistributionCoordinate,
  createDesktopImmutableReleasePrefix,
  getDesktopTargetUpdateFeedUrl,
} from "./desktop/distribution-contract.mjs";

// Schema-1 callers compare this historical shape exactly. The platform-neutral
// registry owns richer target metadata while this façade keeps shipped readers
// byte-compatible.
export const DESKTOP_SHIPPED_STABLE_UPDATE_CONTRACTS = Object.freeze(
  PLATFORM_STABLE_UPDATE_CONTRACTS.map(({ feedUrl, introducedInVersion }) => Object.freeze({
    feedUrl,
    introducedInVersion,
  })),
);

export const DESKTOP_SUPPORTED_STABLE_UPDATE_FEED_URLS = Object.freeze(
  DESKTOP_SHIPPED_STABLE_UPDATE_CONTRACTS.map(({ feedUrl }) => feedUrl),
);

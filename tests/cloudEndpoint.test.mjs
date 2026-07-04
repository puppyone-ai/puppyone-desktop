import { describe, expect, it } from "vitest";

import {
  DEFAULT_CLOUD_API_BASE_URL,
  cloudApiBaseUrlFromRemote,
  normalizeCloudApiBaseUrl,
  normalizeCloudApiPath,
  resolveCloudApiBaseUrl,
  sameCloudApiBaseUrl,
} from "../shared/cloudEndpoint.js";

// First automated test for the desktop repo (ISSUE-023). Targets the pure,
// dependency-free cloud endpoint helpers to establish a runnable baseline.

describe("normalizeCloudApiBaseUrl", () => {
  it("rejects empty / non-string / non-http input", () => {
    expect(normalizeCloudApiBaseUrl("")).toBeNull();
    expect(normalizeCloudApiBaseUrl("   ")).toBeNull();
    expect(normalizeCloudApiBaseUrl(null)).toBeNull();
    expect(normalizeCloudApiBaseUrl("ftp://example.com")).toBeNull();
    expect(normalizeCloudApiBaseUrl("not a url")).toBeNull();
  });

  it("strips trailing slashes, hash and query", () => {
    expect(normalizeCloudApiBaseUrl("https://example.com/api/v1/")).toBe(
      "https://example.com/api/v1",
    );
    expect(normalizeCloudApiBaseUrl("https://example.com/api/v1?x=1#frag")).toBe(
      "https://example.com/api/v1",
    );
  });

  it("forces https and default path for the canonical cloud host", () => {
    expect(normalizeCloudApiBaseUrl("http://api.puppyone.ai")).toBe(
      "https://api.puppyone.ai/api/v1",
    );
  });
});

describe("resolveCloudApiBaseUrl", () => {
  it("falls back to the default when input is invalid", () => {
    expect(resolveCloudApiBaseUrl("")).toBe(DEFAULT_CLOUD_API_BASE_URL);
    expect(resolveCloudApiBaseUrl("garbage")).toBe(DEFAULT_CLOUD_API_BASE_URL);
  });
});

describe("cloudApiBaseUrlFromRemote", () => {
  it("derives the /api/v1 base from a git remote origin", () => {
    expect(cloudApiBaseUrlFromRemote("https://git.example.com/org/repo.git")).toBe(
      "https://git.example.com/api/v1",
    );
  });

  it("returns null for invalid remotes", () => {
    expect(cloudApiBaseUrlFromRemote("")).toBeNull();
    expect(cloudApiBaseUrlFromRemote("ssh://weird")).toBeNull();
  });
});

describe("normalizeCloudApiPath", () => {
  it("ensures a leading slash and defaults empty to '/'", () => {
    expect(normalizeCloudApiPath("nodes")).toBe("/nodes");
    expect(normalizeCloudApiPath("/nodes")).toBe("/nodes");
    expect(normalizeCloudApiPath("")).toBe("/");
  });
});

describe("sameCloudApiBaseUrl", () => {
  it("treats trailing-slash / scheme-normalized variants as equal", () => {
    expect(
      sameCloudApiBaseUrl("https://example.com/api/v1", "https://example.com/api/v1/"),
    ).toBe(true);
    expect(
      sameCloudApiBaseUrl("https://example.com/api/v1", "https://other.com/api/v1"),
    ).toBe(false);
  });
});

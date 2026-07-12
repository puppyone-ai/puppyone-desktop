import { describe, expect, it } from "vitest";
import packageMetadata from "../package.json";
import {
  getStableReleaseCoordinates,
  inspectMacReleaseReadiness,
} from "../scripts/release-support/macos-release-policy.mjs";

const signingEnvironment = {
  CSC_LINK: "certificate.p12",
  CSC_KEY_PASSWORD: "password",
  APPLE_API_KEY: "AuthKey.p8",
  APPLE_API_KEY_ID: "KEY123",
  APPLE_API_ISSUER: "issuer-id",
};

describe("macOS stable release policy", () => {
  it("accepts the production package config with complete signing and notarization credentials", () => {
    expect(inspectMacReleaseReadiness({
      packageMetadata,
      env: signingEnvironment,
      platform: "darwin",
    })).toEqual([]);
  });

  it("rejects internal signing overrides and partial notarization credentials", () => {
    const unsafePackage = {
      ...packageMetadata,
      build: {
        ...packageMetadata.build,
        mac: {
          ...packageMetadata.build.mac,
          identity: "-",
          hardenedRuntime: false,
          notarize: false,
          strictVerify: false,
        },
      },
    };
    const errors = inspectMacReleaseReadiness({
      packageMetadata: unsafePackage,
      env: {
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
        APPLE_ID: "release@example.com",
      },
      platform: "darwin",
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/ad-hoc or disabled signing/i),
      expect.stringMatching(/hardenedRuntime/i),
      expect.stringMatching(/notarization credentials are incomplete/i),
      expect.stringMatching(/reserved for internal unsigned builds/i),
    ]));
  });

  it("requires upload credentials and a tag matching the package version", () => {
    const errors = inspectMacReleaseReadiness({
      packageMetadata,
      env: {
        ...signingEnvironment,
        PUPPYONE_RELEASE_TAG: "v9.9.9",
      },
      platform: "darwin",
      requireUploadCredentials: true,
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/must exactly match package version/i),
      expect.stringMatching(/AWS_ACCESS_KEY_ID/),
      expect.stringMatching(/AWS_SECRET_ACCESS_KEY/),
      expect.stringMatching(/CLOUDFLARE_ACCOUNT_ID/),
    ]));
  });

  it("uses immutable version and mutable latest R2 prefixes", () => {
    expect(getStableReleaseCoordinates({
      packageMetadata,
      env: {
        CLOUDFLARE_ACCOUNT_ID: "account",
        PUPPYONE_RELEASE_TAG: `v${packageMetadata.version}`,
      },
    })).toEqual({
      bucket: "puppyone-desktop",
      endpoint: "https://account.r2.cloudflarestorage.com",
      latestPrefix: "desktop/stable/mac/latest",
      tag: `v${packageMetadata.version}`,
      versionPrefix: `desktop/stable/mac/v${packageMetadata.version}`,
    });
  });
});

import { describe, expect, it } from "vitest";

import { parseExternalAppsSettings } from "../src/preferences";

describe("external app preferences", () => {
  it("drops the legacy renderer-controlled executable confirmation preference", () => {
    const settings = parseExternalAppsSettings(JSON.stringify({
      openMode: "system",
      confirmExecutableFiles: false,
      overrides: [{
        extension: "PDF",
        appPath: " /Applications/Preview.app ",
      }],
    }));

    expect(settings).toEqual({
      openMode: "system",
      overrides: [{
        extension: "pdf",
        appPath: "/Applications/Preview.app",
      }],
    });
    expect(settings).not.toHaveProperty("confirmExecutableFiles");
  });
});

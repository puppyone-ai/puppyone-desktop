import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import desktopConfig from "./vite.config.ts";

export default mergeConfig(desktopConfig, defineConfig({
  test: {
    include: [
      "tests/desktopUpdatePolicy.test.mjs",
      "tests/electron.update-service.test.mjs",
      "tests/desktopReleaseVersionPolicy.test.mjs",
      "tests/electron.native-update-menu-action.test.mjs",
      "tests/desktopUpdateTitlebarModel.test.ts",
      "tests/desktopUpdateSettingsRow.test.tsx",
      "tests/desktop-update.architecture.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/updater-p0",
      include: [
        "electron/update-service.mjs",
        "electron/main/native-update-menu-action.mjs",
        "scripts/release-support/desktop-release-version-policy.mjs",
        "shared/desktop/update-policy.mjs",
        "src/features/updates/updateModel.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 75,
        lines: 75,
      },
    },
  },
}));

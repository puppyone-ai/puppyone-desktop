import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import desktopConfig from "./vite.config.ts";

export default mergeConfig(desktopConfig, defineConfig({
  test: {
    include: [
      "tests/gitAutoCommit*.test.{mjs,tsx}",
      "tests/electron.git-auto-commit-ipc.test.mjs",
      "tests/workspace.git-auto-commit.integration.test.mjs",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/git-auto-commit",
      include: [
        "electron/main/git-auto-commit/**/*.mjs",
        "electron/main/ipc/git-auto-commit-ipc.mjs",
        "local-api/git/auto-commit.mjs",
        "src/features/source-control/useGitAutoCommitSettings.ts",
      ],
      thresholds: {
        statements: 82,
        branches: 80,
        functions: 80,
        lines: 88,
      },
    },
  },
}));

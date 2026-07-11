// Lean ESLint gate (ISSUE-023). Deliberately NOT the full recommended set — on a
// large existing codebase that would flood warnings without adding a real gate.
// Instead: ERROR only on genuine bug-classes (so CI fails on real defects), and
// leave stylistic/legacy debt to tsc + SonarLint. Keeps `npm run lint` green and
// meaningful.
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

const coreBugRules = {
  "no-debugger": "error",
  "no-dupe-keys": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-unreachable": "error",
  "no-cond-assign": ["error", "always"],
  "no-constant-condition": ["error", { checkLoops: false }],
  "no-unsafe-negation": "error",
  "no-unsafe-finally": "error",
  "no-self-assign": "error",
  "no-self-compare": "error",
  "no-fallthrough": "error",
  "no-invalid-regexp": "error",
  "getter-return": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "for-direction": "error",
  "no-async-promise-executor": "error",
  "no-compare-neg-zero": "error",
};

export default [
  {
    ignores: [
      "dist/**", "release/**", "node_modules/**", "vendor/**",
      "src-tauri/**", "build/**", "public/**", "**/*.d.ts", "eslint.config.js",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}", "shared/agent-contract/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2023, sourceType: "module", ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...coreBugRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn", // legacy debt — visible, non-blocking
    },
  },
  {
    files: ["electron/**/*.mjs", "local-api/**/*.mjs", "shared/**/*.{js,mjs}", "scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: { ...globals.node } },
    rules: coreBugRules,
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...globals.node } },
    rules: coreBugRules,
  },
];

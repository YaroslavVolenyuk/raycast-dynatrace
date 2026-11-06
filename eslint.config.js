const { defineConfig } = require("eslint/config");
const raycastConfig = require("@raycast/eslint-config");
const sonarjs = require("eslint-plugin-sonarjs");
const security = require("eslint-plugin-security");

// Layered architecture boundary (Phase 0).
// The SDK layer (src/sdk) must stay a standalone TypeScript client:
// no Raycast and no React imports, ever. This is the hard boundary the
// rewrite depends on — enforced here and mirrored by a CI grep.
const sdkBoundary = {
  files: ["src/sdk/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@raycast/api",
            message: "src/sdk must not import @raycast/api. Keep the SDK free of Raycast/UI concerns.",
          },
          {
            name: "@raycast/utils",
            message: "src/sdk must not import @raycast/utils. Keep the SDK free of Raycast/UI concerns.",
          },
          {
            name: "react",
            message: "src/sdk must not import react. The SDK is a plain TypeScript client.",
          },
        ],
        patterns: [
          {
            group: ["@raycast/*", "react", "react-dom"],
            message: "src/sdk must not import Raycast or React packages.",
          },
          {
            group: ["**/services/**", "**/ui/**"],
            message: "src/sdk must not depend on the services or ui layers (no upward imports).",
          },
        ],
      },
    ],
  },
};

// Services layer (src/services): application logic. No React/JSX, no UI imports.
const servicesBoundary = {
  files: ["src/services/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "react", message: "src/services must not import react." },
        ],
        patterns: [
          {
            group: ["**/ui/**"],
            message: "src/services must not depend on the ui layer (no upward imports).",
          },
        ],
      },
    ],
  },
};

// Static-analysis rules (code quality + security), kept free and local.
// Tests are excluded: fixtures legitimately use dynamic keys, regexes and
// duplicated literals that these rules would flag as noise.
const staticAnalysis = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/**/__tests__/**", "src/**/__mocks__/**", "src/**/__fixtures__/**"],
  ...sonarjs.configs.recommended,
};

const securityRules = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/**/__tests__/**", "src/**/__mocks__/**", "src/**/__fixtures__/**"],
  ...security.configs.recommended,
};

module.exports = defineConfig([...raycastConfig, staticAnalysis, securityRules, sdkBoundary, servicesBoundary]);

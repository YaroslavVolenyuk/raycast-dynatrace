import type { Config } from "jest";

const config: Config = {
  // Compile TS via the explicit transform below rather than `preset: "ts-jest"`
  // (the preset is redundant once transform is set, and avoids preset-resolution
  // flakiness in some environments).
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    // Mock @raycast/api for unit tests (SDK code never imports it; services/ui do).
    "^@raycast/api$": "<rootDir>/src/__mocks__/@raycast/api.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  // All logic modules, src/ui included. React views (*.tsx) are left out: they
  // are thin wrappers over these modules and are checked by hand in Raycast.
  // Entry files (src/dt-*.ts) and the barrel index.ts files only re-export.
  // src/sdk/auth/index.ts is the auth module itself, so it is measured.
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/dt-*.ts",
    "!src/**/__tests__/**",
    "!src/**/__mocks__/**",
    "!src/{sdk,services,ui/hooks}/index.ts",
    "!src/sdk/{grail,resources}/index.ts",
  ],
  // A floor a few points under the current numbers, so a drop fails CI.
  coverageThreshold: {
    global: { statements: 82, branches: 78, functions: 80, lines: 82 },
  },
};

export default config;

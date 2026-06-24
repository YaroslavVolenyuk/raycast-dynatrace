import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    // Mock @raycast/api for unit tests (SDK code never imports it; services/ui do).
    "^@raycast/api$": "<rootDir>/src/__mocks__/@raycast/api.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  collectCoverageFrom: ["src/sdk/**/*.ts", "src/services/**/*.ts"],
  // Coverage gates land in Phase 1 once the SDK has real code to cover.
  // Plan target: 70% overall / 80% new / 90% for sdk/http + sdk/auth.
};

export default config;

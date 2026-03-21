import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__fixtures__/**", "src/**/*.test.ts"],
      thresholds: {
        lines: 72,
        branches: 66,
      },
    },
  },
});

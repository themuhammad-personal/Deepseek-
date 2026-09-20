import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser"],
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup.js"],
    include: ["src/**/*.test.js", "tests/**/*.test.js"],
    environment: "node",
    testTimeout: 15000,
    css: true,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.js", "src/**/*.svelte"],
      exclude: [
        "src/**/*.test.js",
        "tests/**",
        "dist-*/**",
      ],
    },
  },
});

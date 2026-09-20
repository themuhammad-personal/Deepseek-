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
    poolOptions: {
      forks: {
        execArgv: ["--max-old-space-size=4096", "--expose-gc"],
      },
      threads: {
        execArgv: ["--max-old-space-size=4096", "--expose-gc"],
      },
    },
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

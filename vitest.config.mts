import { defineConfig, coverageConfigDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}", "tests/integration/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "tests/",
        ".next/",
        "**/types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // 複数テストファイルが同一 Postgres test DB を共有するため直列実行する
    fileParallelism: false,
    env: {
      // Postgres URL は CI / ローカルで個別に上書き。事前に prisma db push が必要。
      DATABASE_URL:
        process.env["DATABASE_URL"] ??
        "postgresql://postgres:postgres@localhost:5432/lms_test",
      SESSION_SECRET: "test-secret-for-vitest-at-least-32-chars-long",
      NODE_ENV: "test",
    },
    include: [
      "tests/unit/**/*.spec.ts",
      "tests/unit/**/*.spec.tsx",
      "tests/component/**/*.spec.ts",
      "tests/component/**/*.spec.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    exclude: [
      "tests/e2e/**",
      "node_modules",
      ".next",
    ],
    coverage: {
      provider: "v8",
      include: ["src/server/services/**"],
      reporter: ["text", "json"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

/**
 * Playwright グローバルセットアップ
 *
 * E2E テスト前に test.db を初期化してシードデータを投入する。
 */
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

export default async function globalSetup() {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL:
      process.env["DATABASE_URL"] ??
      "postgresql://postgres:postgres@localhost:5432/lms_test",
    NODE_ENV: "test" as const,
  };

  // DB スキーマを test.db に適用
  execSync(
    "~/Library/pnpm/pnpm exec prisma db push --accept-data-loss --schema=prisma/schema.prisma",
    { cwd: ROOT, env, stdio: "inherit" },
  );

  // シードデータを投入
  execSync("~/Library/pnpm/pnpm exec tsx prisma/seed.ts", {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
}

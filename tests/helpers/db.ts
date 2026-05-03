/**
 * テスト用 Prisma ヘルパー
 *
 * vitest.config.ts の env で DATABASE_URL=file:./prisma/test.db を設定済み。
 * このモジュールでは直接 PrismaClient を生成する。
 * サービス側の src/server/repositories/db.ts とは別インスタンスだが、
 * 同じ SQLite ファイルを参照するため resetDb() 後の変更はサービス側からも参照される。
 *
 * Phase E: Course / Lesson / Test / Question / Choice は Prisma から削除済み。
 * resetDb() から該当テーブルの deleteMany 呼び出しを除去。
 */

import { PrismaClient } from "@prisma/client";

// 環境変数で test.db を指定 (vitest.config.ts の env が有効)
export const testPrisma = new PrismaClient({
  datasources: {
    db: { url: process.env["DATABASE_URL"] ?? "file:./prisma/test.db" },
  },
  log: ["error"],
});

/**
 * 全テーブルを FK 制約の順番で削除してリセットする。
 * 各テストの beforeEach で呼び出す。
 */
export async function resetDb(): Promise<void> {
  await testPrisma.answer.deleteMany();
  await testPrisma.submission.deleteMany();
  await testPrisma.progress.deleteMany();
  await testPrisma.enrollment.deleteMany();
  await testPrisma.auditLog.deleteMany();
  await testPrisma.user.deleteMany();
}

/**
 * 既存 AuditLog レコードに hash chain を backfill するスクリプト
 *
 * 使い方:
 *   pnpm exec tsx scripts/backfill-audit-hash.ts
 *
 * 処理内容:
 *   - hash が "" のレコードのみ対象 (冪等性を保証)
 *   - createdAt 昇順で走査し、prevHash → hash を順に計算して UPDATE
 *   - 既存レコードが 0 件の場合は何もせず exit 0
 *
 * 注意:
 *   - マイグレーション (prisma migrate deploy) 実行後に一度だけ実行すること
 *   - 実行中に新規レコードが書き込まれても、新規レコードは hash 済みのため
 *     chain の先頭に連結されるが backfill 対象外となる
 */

import { PrismaClient } from "@prisma/client";
import { computeAuditHash } from "../src/lib/audit-hash";

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // hash が "" のレコードを createdAt 昇順で全件取得
    const records = await prisma.auditLog.findMany({
      where: { hash: "" },
      orderBy: { at: "asc" },
      select: {
        id: true,
        actorId: true,
        action: true,
        target: true,
        diff: true,
        at: true,
      },
    });

    if (records.length === 0) {
      console.log("backfill 対象レコードはありません (hash 済みまたは 0 件)。");
      return;
    }

    console.log(`backfill 対象: ${records.length} 件`);

    // 最初のレコードの直前 hash を取得
    // backfill 対象の最古レコードより前に hash 済みのレコードがある場合はその hash を使う
    const firstRecord = records[0]!;
    const preceding = await prisma.auditLog.findFirst({
      where: {
        at: { lt: firstRecord.at },
        hash: { not: "" },
      },
      orderBy: { at: "desc" },
      select: { hash: true },
    });

    let prevHash: string | null = preceding?.hash ?? null;

    for (const record of records) {
      const hash = computeAuditHash({
        id: record.id,
        actorId: record.actorId,
        action: record.action,
        target: record.target,
        diff: record.diff || null,
        createdAt: record.at,
        prevHash,
      });

      await prisma.auditLog.update({
        where: { id: record.id },
        data: { prevHash, hash },
      });

      prevHash = hash;
    }

    console.log(`backfill 完了: ${records.length} 件を更新しました。`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

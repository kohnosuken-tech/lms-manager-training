/**
 * AuditLog hash chain 整合性検証ツール
 *
 * 使い方:
 *   pnpm exec tsx scripts/verify-audit-chain.ts
 *
 * 処理内容:
 *   - 全 AuditLog を createdAt 昇順で取得
 *   - 各レコードの hash を再計算し、保存された hash と一致するか検証
 *   - 各レコードの prevHash が前レコードの hash と一致するか検証
 *   - 全件 OK なら exit 0、不一致が 1 件でもあれば exit 1
 *
 * 注意:
 *   - このツールは改ざん「検知」ツールであり改ざん「防止」ではない
 *   - DB write 権限を持つ者が hash を含めて書き換えた場合は検知できない
 */

import { PrismaClient } from "@prisma/client";
import { computeAuditHash } from "../src/lib/audit-hash";

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const records = await prisma.auditLog.findMany({
      orderBy: { at: "asc" },
      select: {
        id: true,
        actorId: true,
        action: true,
        target: true,
        diff: true,
        at: true,
        prevHash: true,
        hash: true,
      },
    });

    if (records.length === 0) {
      console.log("AuditLog レコードが 0 件です。検証をスキップします。");
      process.exit(0);
    }

    console.log(`AuditLog ${records.length} 件を検証します...`);

    let errorCount = 0;
    let prevHashInChain: string | null = null;

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;

      // prevHash の連続性を検証
      if (record.prevHash !== prevHashInChain) {
        console.error(
          `[ERROR] レコード #${i + 1} id=${record.id}: prevHash 不一致\n` +
            `  expected: ${prevHashInChain ?? "null"}\n` +
            `  stored:   ${record.prevHash ?? "null"}`,
        );
        errorCount++;
      }

      // hash の再計算と照合
      const expected = computeAuditHash({
        id: record.id,
        actorId: record.actorId,
        action: record.action,
        target: record.target,
        diff: record.diff || null,
        createdAt: record.at,
        prevHash: record.prevHash,
      });

      if (record.hash !== expected) {
        console.error(
          `[ERROR] レコード #${i + 1} id=${record.id}: hash 不一致\n` +
            `  expected: ${expected}\n` +
            `  stored:   ${record.hash}`,
        );
        errorCount++;
      }

      // 次レコードの prevHash 検証用に現在の hash を更新
      // hash が空の場合 (backfill 未実施) は保存値をそのまま使う
      prevHashInChain = record.hash || null;
    }

    if (errorCount === 0) {
      console.log(`全 ${records.length} 件の chain が正常です。`);
      process.exit(0);
    } else {
      console.error(`検証失敗: ${errorCount} 件の不一致が見つかりました。`);
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

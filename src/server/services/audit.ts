/**
 * 監査ログ取得サービス
 *
 * カーソルは id ベース (at desc, id desc 降順)。
 * actor (User) を include で一括取得して N+1 を回避する。
 */

import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/server/repositories/db";

export type AuditLogItem = {
  id: string;
  action: AuditAction;
  target: string | null;
  diff: string; // JSON 文字列のまま返す (UI 側で必要に応じて parse)
  at: Date;
  actor: {
    id: string;
    email: string;
    name: string;
  } | null;
};

export type ListAuditLogsInput = {
  cursor?: string; // AuditLog.id — このレコードより古いものを返す
  action?: AuditAction;
  limit?: number;
  /** actorId または actor.email の部分一致 */
  actor?: string;
  /** 範囲フィルタ: この日時以降 */
  from?: Date;
  /** 範囲フィルタ: この日時以前 */
  to?: Date;
};

export type ListAuditLogsResult = {
  items: AuditLogItem[];
  nextCursor: string | null; // 次ページの先頭 id。null なら最終ページ
};

export async function listAuditLogs(
  input: ListAuditLogsInput = {},
): Promise<ListAuditLogsResult> {
  const limit = Math.min(input.limit ?? 50, 200);

  // cursor が指定されている場合、そのレコードの at を取得して filter に使う
  let cursorRecord: { at: Date; id: string } | null = null;
  if (input.cursor) {
    cursorRecord = await prisma.auditLog.findUnique({
      where: { id: input.cursor },
      select: { at: true, id: true },
    });
  }

  const where: Prisma.AuditLogWhereInput = {
    ...(input.action ? { action: input.action } : {}),
    // actor フィルタ: actorId 直接一致 または actor.email 部分一致
    ...(input.actor
      ? {
          OR: [
            { actorId: { equals: input.actor } },
            { actor: { email: { contains: input.actor } } },
          ],
        }
      : {}),
    // at 範囲フィルタ
    ...((input.from || input.to)
      ? {
          at: {
            ...(input.from ? { gte: input.from } : {}),
            ...(input.to ? { lte: input.to } : {}),
          },
        }
      : {}),
    // カーソルより古いレコード: at が cursor の at より小さい、
    // または at が同じで id が cursor より小さい (辞書順)
    ...(cursorRecord
      ? {
          OR: [
            { at: { lt: cursorRecord.at } },
            { at: cursorRecord.at, id: { lt: cursorRecord.id } },
          ],
        }
      : {}),
  };

  // actor フィルタとカーソルフィルタが同時に OR 句を持つ場合は AND でラップする
  const finalWhere: Prisma.AuditLogWhereInput =
    input.actor && cursorRecord
      ? {
          AND: [
            {
              OR: [
                { actorId: { equals: input.actor } },
                { actor: { email: { contains: input.actor } } },
              ],
            },
            {
              OR: [
                { at: { lt: cursorRecord.at } },
                { at: cursorRecord.at, id: { lt: cursorRecord.id } },
              ],
            },
            ...(input.action ? [{ action: input.action }] : []),
            ...((input.from || input.to)
              ? [
                  {
                    at: {
                      ...(input.from ? { gte: input.from } : {}),
                      ...(input.to ? { lte: input.to } : {}),
                    },
                  },
                ]
              : []),
          ],
        }
      : where;

  const items = await prisma.auditLog.findMany({
    where: finalWhere,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit + 1, // 次ページ有無を判定するために 1 件余分に取得
    select: {
      id: true,
      action: true,
      target: true,
      diff: true,
      at: true,
      actor: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  const hasNext = items.length > limit;
  const page = hasNext ? items.slice(0, limit) : items;
  const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

  return { items: page, nextCursor };
}

/**
 * stub / prod 共通の AuditLog 書込アダプタ
 *
 * write() では以下の手順で hash chain を維持する:
 *   1. 直前レコードの hash を取得 (findFirst, createdAt desc)
 *   2. id と createdAt を事前に確定
 *   3. computeAuditHash で hash を計算
 *   4. prevHash, hash を含めて create
 *
 * 同時書込競合:
 *   100 名規模かつ SQLite はシリアライズされるため現状は問題なし。
 *   Neon Postgres 移行後は SELECT FOR UPDATE またはキュー化を検討すること。
 */

import { randomUUID } from "node:crypto";
import type { AuditPort } from "@/server/ports/audit";
import { prisma } from "@/server/repositories/db";
import { computeAuditHash } from "@/lib/audit-hash";

export const stubAudit: AuditPort = {
  async write({ actorId, action, target, diff }) {
    // 直前レコードの hash を取得
    const last = await prisma.auditLog.findFirst({
      orderBy: { at: "desc" },
      select: { hash: true },
    });
    const prevHash = last?.hash || null;

    // id と createdAt を事前に確定
    const id = randomUUID();
    const createdAt = new Date();

    // diff を JSON 文字列に正規化
    const diffStr = diff === undefined ? "" : JSON.stringify(diff);

    // hash を計算
    const hash = computeAuditHash({
      id,
      actorId: actorId ?? null,
      action,
      target: target ?? null,
      diff: diffStr,
      createdAt,
      prevHash,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.auditLog.create({
      data: {
        id,
        actorId: actorId ?? null,
        // Prisma enum cast: AuditPort.action は string だが Prisma は AuditAction enum を要求する
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: action as any,
        target: target ?? null,
        diff: diffStr,
        at: createdAt,
        prevHash,
        hash,
      },
    });
  },
};

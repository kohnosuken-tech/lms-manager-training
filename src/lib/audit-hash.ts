/**
 * AuditLog hash chain ユーティリティ
 *
 * 各 AuditLog レコードの hash を計算する。
 * 計算式:
 *   SHA-256(
 *     (prevHash ?? "") + "|" + id + "|" + actorId + "|" +
 *     action + "|" + (target ?? "") + "|" + (diff ?? "") + "|" +
 *     createdAt.toISOString()
 *   )
 *
 * - null フィールドは "" に正規化 (diff=null と diff="" は同一視)
 * - Node.js の node:crypto を使うため server-side 限定
 */

import { createHash } from "node:crypto";

export type AuditHashInput = {
  id: string;
  actorId: string | null;
  action: string;
  target: string | null;
  diff: string | null; // JSON 文字列のまま渡す (null/undefined は "" に正規化)
  createdAt: Date;
  prevHash: string | null;
};

/**
 * AuditLog レコードの SHA-256 hash を hex 文字列で返す。
 */
export function computeAuditHash(input: AuditHashInput): string {
  const prevHash = input.prevHash ?? "";
  const actorId = input.actorId ?? "";
  const target = input.target ?? "";
  const diff = input.diff ?? "";
  const createdAt = input.createdAt.toISOString();

  const payload = [
    prevHash,
    input.id,
    actorId,
    input.action,
    target,
    diff,
    createdAt,
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex");
}

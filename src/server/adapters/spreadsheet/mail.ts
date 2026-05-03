/**
 * GAS relay 経由の MailPort 実装。
 *
 * - GAS 側で idempotencyKey によるキャッシュ重複防止が実装済み
 * - 送信失敗時はログ出力のみ (MailDelivery テーブルは Phase E 以降で実装)
 * - idempotencyKey は呼び出し側で必ず生成して渡すこと
 */

import type { MailPort } from "@/server/ports/mail";
import { callGas } from "./gas-client";
import { stubLogger } from "@/server/adapters/stub/logger";
import { randomUUID } from "node:crypto";

export const gasMail: MailPort = {
  async send(to: string, subject: string, body: string): Promise<void> {
    // idempotencyKey: 呼び出し元がキーを渡せないため、ここで to+subject の組み合わせで生成
    // 完全な冪等性を保証するには呼び出し元でキーを生成して渡す形が望ましいが、
    // 既存 MailPort interface (to, subject, body) に合わせるため uuid を生成する
    const idempotencyKey = randomUUID();

    try {
      const res = await callGas("send_mail", {
        to,
        subject,
        body,
        idempotencyKey,
      });

      if (!res.ok) {
        stubLogger.error("[mail.gas] GAS send_mail failed", {
          to,
          subject,
          error: res.error,
        });
      } else {
        stubLogger.info("[mail.gas] sent", { to, subject, idempotencyKey });
      }
    } catch (err) {
      // 送信失敗はログのみ — MailDelivery 永続化は Phase E 以降
      stubLogger.error("[mail.gas] send_mail exception", {
        to,
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

/**
 * prod mail adapter — Resend 実装 (Phase 4 TODO)
 *
 * 実装手順:
 * 1. `pnpm add resend` を実行する
 * 2. Vercel ダッシュボードで Resend Marketplace integration を install し、
 *    RESEND_API_KEY を auto-inject させる
 * 3. 送信元ドメインを Resend ダッシュボードで DNS 検証する
 * 4. 下記 TODO コメントを実際の Resend SDK 呼び出しに置き換える
 */

import type { MailPort } from "@/server/ports/mail";

// TODO(Phase4): import { Resend } from "resend";
// const resend = new Resend(process.env.RESEND_API_KEY);

export const prodMail: MailPort = {
  async send(_to: string, _subject: string, _body: string): Promise<void> {
    // TODO(Phase4):
    // await resend.emails.send({
    //   from: "noreply@<your-verified-domain>",
    //   to,
    //   subject,
    //   text: body,
    // });
    throw new Error("[Phase4] prodMail.send is not implemented.");
  },
};

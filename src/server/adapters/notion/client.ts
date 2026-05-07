/**
 * Notion API クライアント初期化 + rate limiter ラッパー
 *
 * @notionhq/client を直接使わず、必ず notionRequest() を経由すること。
 * これにより rate limiter が全呼び出しに適用される。
 *
 * env:
 *   NOTION_TOKEN — Internal Integration Secret (secret_xxx)
 */

import { Client } from "@notionhq/client";
import { notionRateLimiter } from "./rate-limiter";

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      throw new Error(
        "[notion/client] NOTION_TOKEN が設定されていません。" +
          ".env.local に NOTION_TOKEN=secret_xxx を追加してください。",
      );
    }
    _client = new Client({ auth: token });
  }
  return _client;
}

/**
 * rate limiter を適用して Notion API 呼び出しを実行する。
 * @param fn — @notionhq/client の API を呼ぶ関数
 */
export async function notionRequest<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  await notionRateLimiter.acquire();
  return fn(getClient());
}

/** テスト用: クライアントをリセットする */
export function _resetClientForTest(): void {
  _client = null;
}

export { getClient };

/**
 * GAS Web App への HMAC-SHA256 署名付きリクエストクライアント。
 *
 * 仕様:
 * - POST body = JSON.stringify({ action, ...params })
 * - 署名 = HMAC-SHA256(timestamp + "." + body, GAS_SECRET).hex()
 * - timestamp と sig は URL クエリパラメータで渡す (GAS が request header を受け取れない場合がある)
 *   かつ X-Timestamp / X-Signature ヘッダでも送る (GAS 側が headerOf_ で取得)
 * - GAS Web App は 302 リダイレクトを返す → fetch の redirect:"follow" (デフォルト) で追従
 * - レスポンス body を text() で取得し JSON.parse。HTML が返った場合は throw
 * - 失敗時は 1 回リトライ (タイムアウト 10 秒)
 */

import { createHmac } from "node:crypto";

export type GasResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * GAS Web App を呼び出す。
 * @param action GAS 側の switch 分岐キー (例: "list_courses")
 * @param params action 以外の追加パラメータ
 */
export async function callGas<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<GasResponse<T>> {
  const url = process.env.GAS_WEBAPP_URL;
  const secret = process.env.GAS_SECRET;

  if (!url) throw new Error("[gas-client] GAS_WEBAPP_URL is not set");
  if (!secret) throw new Error("[gas-client] GAS_SECRET is not set");

  return callWithRetry<T>(url, secret, action, params, 1);
}

// ---- internal ----

async function callWithRetry<T>(
  url: string,
  secret: string,
  action: string,
  params: Record<string, unknown>,
  retriesLeft: number,
): Promise<GasResponse<T>> {
  try {
    return await callOnce<T>(url, secret, action, params);
  } catch (err) {
    if (retriesLeft > 0) {
      return callWithRetry<T>(url, secret, action, params, retriesLeft - 1);
    }
    throw err;
  }
}

async function callOnce<T>(
  url: string,
  secret: string,
  action: string,
  params: Record<string, unknown>,
): Promise<GasResponse<T>> {
  const ts = Date.now();
  const body = JSON.stringify({ action, ...params });
  const sig = sign(ts, body, secret);

  const targetUrl = `${url}?ts=${ts}&sig=${encodeURIComponent(sig)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let text: string;
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": String(ts),
        "X-Signature": sig,
      },
      body,
      redirect: "follow",
      signal: controller.signal,
    });
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // GAS が HTML (エラーページ等) を返した場合は throw
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    throw new Error(
      `[gas-client] Non-JSON response from GAS (action=${action}): ${trimmed.slice(0, 200)}`,
    );
  }

  const parsed = JSON.parse(trimmed) as GasResponse<T>;
  return parsed;
}

/** HMAC-SHA256(timestamp + "." + body, secret) を hex で返す */
export function sign(ts: number, body: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${ts}.${body}`)
    .digest("hex");
}

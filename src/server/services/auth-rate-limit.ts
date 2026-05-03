/**
 * H-1: ログイン brute force 対策
 *
 * モジュールスコープの Map を使ったメモリ内レートリミット。
 * 単一プロセス前提 (mock-first)。本番では Redis / Upstash 等に差し替える。
 *
 * ウィンドウ: WINDOW_MS (15 分) でスライディングウィンドウ
 * 上限: MAX_ATTEMPTS (5 回) を超えたら RATE_LIMITED
 */

export const WINDOW_MS = 15 * 60 * 1000; // 15 分
export const MAX_ATTEMPTS = 5;

type Entry = {
  count: number;
  firstAt: number;
};

/**
 * key = `${ip}:${email}` のカウンタ
 * テスト時に差し替えられるよう export する
 */
export const rateLimitMap = new Map<string, Entry>();

function makeKey(ip: string, email: string): string {
  return `${ip}:${email.toLowerCase()}`;
}

/**
 * 試行失敗を記録する。
 * WINDOW_MS を超えていたら初期化してからカウントアップ。
 */
export function recordFailure(ip: string, email: string): void {
  const key = makeKey(ip, email);
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.firstAt >= WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, firstAt: now });
  } else {
    rateLimitMap.set(key, { count: entry.count + 1, firstAt: entry.firstAt });
  }
}

/**
 * ロックされているかを判定する。
 * WINDOW_MS を過ぎていたらロック解除扱い。
 */
export function isLocked(ip: string, email: string): boolean {
  const key = makeKey(ip, email);
  const entry = rateLimitMap.get(key);
  if (!entry) return false;

  const now = Date.now();
  if (now - entry.firstAt >= WINDOW_MS) {
    rateLimitMap.delete(key);
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

/**
 * ログイン成功時にカウンタをリセットする。
 */
export function resetCounter(ip: string, email: string): void {
  rateLimitMap.delete(makeKey(ip, email));
}

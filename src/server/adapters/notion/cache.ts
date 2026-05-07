/**
 * Notion adapter 用 in-memory キャッシュ
 *
 * TTL 別の 3 階層:
 *   long  = 5 分  (Course / Lesson / Test / Question / Choice)
 *   short = 30 秒 (User / Enrollment)
 *   none  = キャッシュなし (Progress / Submission / Answer / AuditLog)
 */

type Tier = "long" | "short" | "none";

const TTL_MS: Record<Tier, number> = {
  long: 5 * 60_000,
  short: 30_000,
  none: 0,
};

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/**
 * キャッシュを通して値を取得する。
 * tier="none" の場合は常に fetchFn を呼ぶ。
 */
export async function cached<T>(
  key: string,
  tier: Tier,
  fetchFn: () => Promise<T>,
): Promise<T> {
  if (tier === "none") {
    return fetchFn();
  }

  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const data = await fetchFn();
  store.set(key, { data, expiresAt: now + TTL_MS[tier] });
  return data;
}

/** 特定のキーを無効化する */
export function invalidate(key: string): void {
  store.delete(key);
}

/** プレフィックスが一致するキーをすべて無効化する */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/** テスト用: 全キャッシュをクリアする */
export function clearAllCache(): void {
  store.clear();
}

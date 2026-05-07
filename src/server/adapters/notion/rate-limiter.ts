/**
 * Notion API rate limiter — token bucket 実装
 *
 * Notion API は平均 3 req/s、burst 5 req まで許容。
 * 全 Notion API 呼び出しをこの limiter 経由にすることで throttle する。
 *
 * Vercel Function 内 in-memory なのでプロセス単位の best-effort。
 * 分散ロックは不要 (< 30 名同時アクセス想定)。
 */

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    /** acquire() が最大待機する ms (超えたら RATE_LIMITED error) */
    private readonly maxWaitMs: number = 5000,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    const deadline = Date.now() + this.maxWaitMs;

    while (true) {
      const now = Date.now();
      const elapsed = (now - this.lastRefill) / 1000;
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsed * this.refillPerSec,
      );
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      if (Date.now() >= deadline) {
        throw new Error("RATE_LIMITED: Notion API rate limit 待機タイムアウト (5s)");
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
  }

  /** テスト用: トークンを強制的にリセットする */
  resetForTest(tokens?: number): void {
    this.tokens = tokens ?? this.capacity;
    this.lastRefill = Date.now();
  }
}

/**
 * グローバルシングルトン (burst 5, 3 req/s sustained)
 * 全 notion adapter から参照する。
 */
export const notionRateLimiter = new TokenBucket(5, 3, 5000);

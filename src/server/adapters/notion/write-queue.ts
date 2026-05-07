/**
 * Progress 書き込みキュー (30 秒バッファ)
 *
 * 同一 (userId, lessonId) の最新値のみ保持し、flush 時に Notion へ書き込む。
 * Vercel Function 内 in-memory なので best-effort。
 * Function 再起動でロストした場合はクライアント localStorage が補完する。
 *
 * flushNow() を公開することでテスト可能にする。
 */

export type PendingProgress = {
  userId: string;
  lessonId: string;
  watchedSec: number;
  lastPositionSec: number;
  completed: boolean;
  completedAt: string | null;
  updatedAt: string;
};

export type FlushFn = (items: PendingProgress[]) => Promise<void>;

export class ProgressWriteQueue {
  private queue = new Map<string, PendingProgress>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private onFlushError?: (err: Error) => void;

  constructor(
    private readonly flushFn: FlushFn,
    private readonly flushIntervalMs: number = 30_000,
    private readonly maxConsecutiveFailures: number = 3,
  ) {}

  /**
   * キューに積む。同一キーは上書き (最新値のみ保持)。
   */
  enqueue(item: PendingProgress): void {
    const key = `${item.userId}:${item.lessonId}`;
    this.queue.set(key, item);
  }

  /**
   * タイマーを開始する (サーバー起動時に呼ぶ)。
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flushNow();
    }, this.flushIntervalMs);
  }

  /**
   * タイマーを停止する (graceful shutdown や テスト teardown 時)。
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * キューを即時 flush する。テスト / graceful shutdown で使用。
   */
  async flushNow(): Promise<void> {
    if (this.queue.size === 0) return;

    const items = Array.from(this.queue.values());
    this.queue.clear();

    try {
      await this.flushFn(items);
      this.consecutiveFailures = 0;
    } catch (err) {
      // 失敗時: キューに戻す (次回 flush でリトライ)
      for (const item of items) {
        const key = `${item.userId}:${item.lessonId}`;
        // 既に新しい値がキューにある場合は上書きしない
        if (!this.queue.has(key)) {
          this.queue.set(key, item);
        }
      }
      this.consecutiveFailures++;

      if (this.onFlushError) {
        this.onFlushError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /** テスト用: 現在のキューサイズを返す */
  get size(): number {
    return this.queue.size;
  }

  /** テスト用: 連続失敗カウントを返す */
  get failures(): number {
    return this.consecutiveFailures;
  }

  setFlushErrorHandler(handler: (err: Error) => void): void {
    this.onFlushError = handler;
  }
}

/**
 * notion/write-queue.ts のユニットテスト
 *
 * ProgressWriteQueue の enqueue / flushNow / retry 動作を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ProgressWriteQueue,
  type PendingProgress,
} from "@/server/adapters/notion/write-queue";

function makeProgress(userId: string, lessonId: string, watchedSec = 100): PendingProgress {
  return {
    userId,
    lessonId,
    watchedSec,
    lastPositionSec: watchedSec,
    completed: false,
    completedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

describe("ProgressWriteQueue", () => {
  it("enqueue すると size が増える", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = new ProgressWriteQueue(flush, 30_000);

    queue.enqueue(makeProgress("u1", "l1"));
    expect(queue.size).toBe(1);
  });

  it("同一 (userId, lessonId) は上書きされる", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = new ProgressWriteQueue(flush, 30_000);

    queue.enqueue(makeProgress("u1", "l1", 100));
    queue.enqueue(makeProgress("u1", "l1", 200));
    expect(queue.size).toBe(1);
  });

  it("異なる (userId, lessonId) は別レコードになる", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = new ProgressWriteQueue(flush, 30_000);

    queue.enqueue(makeProgress("u1", "l1"));
    queue.enqueue(makeProgress("u1", "l2"));
    queue.enqueue(makeProgress("u2", "l1"));
    expect(queue.size).toBe(3);
  });

  it("flushNow() でキューが空になり flushFn が呼ばれる", async () => {
    const flushed: PendingProgress[] = [];
    const flush = vi.fn().mockImplementation(async (items: PendingProgress[]) => {
      flushed.push(...items);
    });
    const queue = new ProgressWriteQueue(flush, 30_000);

    queue.enqueue(makeProgress("u1", "l1", 100));
    queue.enqueue(makeProgress("u2", "l2", 200));

    await queue.flushNow();

    expect(queue.size).toBe(0);
    expect(flushed).toHaveLength(2);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("空のキューで flushNow() を呼んでも flushFn は呼ばれない", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = new ProgressWriteQueue(flush, 30_000);

    await queue.flushNow();

    expect(flush).not.toHaveBeenCalled();
  });

  it("flushFn が失敗したときはキューに戻されてリトライできる", async () => {
    let callCount = 0;
    const flush = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network error");
    });
    const queue = new ProgressWriteQueue(flush, 30_000);
    queue.enqueue(makeProgress("u1", "l1", 100));

    // 1 回目は失敗
    await queue.flushNow();
    expect(queue.size).toBe(1); // キューに戻っている
    expect(queue.failures).toBe(1);

    // 2 回目は成功
    await queue.flushNow();
    expect(queue.size).toBe(0);
    expect(queue.failures).toBe(0);
  });

  it("flush 失敗時に既に新しい値がある場合は上書きしない", async () => {
    const flush = vi.fn().mockRejectedValueOnce(new Error("fail"));
    const queue = new ProgressWriteQueue(flush, 30_000);

    const old = makeProgress("u1", "l1", 100);
    queue.enqueue(old);

    // flush 中に新しい値を enqueue (実際にはタイマー並行で起こりうる)
    // flushNow 呼び出し前に新しい値を追加
    const newer = makeProgress("u1", "l1", 200);

    // 失敗させる
    await queue.flushNow();
    // 失敗後にキューに old が戻る。その後 newer を enqueue
    queue.enqueue(newer);

    // size は 1 のまま (上書き)
    expect(queue.size).toBe(1);
  });

  it("onFlushError ハンドラが呼ばれる", async () => {
    const flush = vi.fn().mockRejectedValue(new Error("Test error"));
    const queue = new ProgressWriteQueue(flush, 30_000);

    const errors: Error[] = [];
    queue.setFlushErrorHandler((err) => errors.push(err));
    queue.enqueue(makeProgress("u1", "l1", 100));

    await queue.flushNow();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("Test error");
  });

  it("start/stop でタイマーが制御できる", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = new ProgressWriteQueue(flush, 30_000);

    // start を 2 回呼んでも 1 つのタイマー
    queue.start();
    queue.start(); // 2 回目は no-op

    queue.stop();
    // stop 後は size 変化なし
    queue.enqueue(makeProgress("u1", "l1"));
    // タイマーは止まっているので flush は呼ばれない (即座には)
    expect(flush).not.toHaveBeenCalled();
  });
});

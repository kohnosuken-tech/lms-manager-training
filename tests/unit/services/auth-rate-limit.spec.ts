/**
 * H-1: ログイン brute force 対策のテスト
 *
 * メモリ内 Map を使ったレートリミットの動作を検証する。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  isLocked,
  recordFailure,
  resetCounter,
  rateLimitMap,
  WINDOW_MS,
  MAX_ATTEMPTS,
} from "@/server/services/auth-rate-limit";

const TEST_IP = "192.0.2.1";
const TEST_EMAIL = "test@example.com";

describe("auth-rate-limit", () => {
  beforeEach(() => {
    // 各テスト前にマップをクリア
    rateLimitMap.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isLocked", () => {
    it("カウンタが未登録なら false を返す", () => {
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(false);
    });

    it(`${MAX_ATTEMPTS - 1} 回失敗しても false を返す`, () => {
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        recordFailure(TEST_IP, TEST_EMAIL);
      }
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(false);
    });

    it(`${MAX_ATTEMPTS} 回失敗すると true を返す`, () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        recordFailure(TEST_IP, TEST_EMAIL);
      }
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(true);
    });

    it("WINDOW_MS 経過後はロックが解除されて false を返す", () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        recordFailure(TEST_IP, TEST_EMAIL);
      }
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(true);

      // WINDOW_MS 分時間を進める
      vi.advanceTimersByTime(WINDOW_MS);
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(false);
    });

    it("email は大文字小文字を区別しない", () => {
      const upper = "TEST@EXAMPLE.COM";
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        recordFailure(TEST_IP, upper);
      }
      // 小文字でチェックしても同じカウンタを参照する
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(true);
    });

    it("IP が異なれば別のカウンタを参照する", () => {
      const otherIp = "192.0.2.2";
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        recordFailure(TEST_IP, TEST_EMAIL);
      }
      // 別 IP はロックされていない
      expect(isLocked(otherIp, TEST_EMAIL)).toBe(false);
    });
  });

  describe("recordFailure", () => {
    it("WINDOW_MS 経過後に recordFailure を呼ぶとカウンタがリセットされる", () => {
      // 4 回失敗
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
        recordFailure(TEST_IP, TEST_EMAIL);
      }

      // WINDOW_MS 分時間を進める
      vi.advanceTimersByTime(WINDOW_MS);

      // 再度 recordFailure を呼ぶと firstAt がリセットされて count=1 になる
      recordFailure(TEST_IP, TEST_EMAIL);
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(false);

      const entry = rateLimitMap.get(`${TEST_IP}:${TEST_EMAIL}`);
      expect(entry?.count).toBe(1);
    });
  });

  describe("resetCounter", () => {
    it("成功後に resetCounter を呼ぶとロックが解除される", () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        recordFailure(TEST_IP, TEST_EMAIL);
      }
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(true);

      resetCounter(TEST_IP, TEST_EMAIL);
      expect(isLocked(TEST_IP, TEST_EMAIL)).toBe(false);
      expect(rateLimitMap.has(`${TEST_IP}:${TEST_EMAIL}`)).toBe(false);
    });

    it("カウンタが未登録でも resetCounter を呼んでもエラーにならない", () => {
      expect(() => resetCounter(TEST_IP, TEST_EMAIL)).not.toThrow();
    });
  });
});

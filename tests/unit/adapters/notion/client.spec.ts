/**
 * notion/client.ts — rate limiter + client 初期化のユニットテスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenBucket } from "@/server/adapters/notion/rate-limiter";

// ---------- TokenBucket ----------

describe("TokenBucket", () => {
  it("トークンが十分にあれば即座に acquire() が返る", async () => {
    const bucket = new TokenBucket(5, 3, 1000);
    const start = Date.now();
    await bucket.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("トークンを使い切った後は待機する", async () => {
    const bucket = new TokenBucket(1, 10, 2000); // 1 トークン、補充速度速め (10/s)
    await bucket.acquire(); // 1 トークン消費
    // 次の acquire は少し待つ必要がある (10 req/s = 100ms で 1 補充)
    const start = Date.now();
    await bucket.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(50);
  });

  it("maxWaitMs を超えると RATE_LIMITED エラーを投げる", async () => {
    const bucket = new TokenBucket(1, 0.01, 100); // 補充極端に遅い、待機上限 100ms
    await bucket.acquire(); // 1 トークン消費
    await expect(bucket.acquire()).rejects.toThrow("RATE_LIMITED");
  });

  it("resetForTest() でトークンを補充できる", async () => {
    const bucket = new TokenBucket(3, 0.01, 200); // 補充遅い、maxWait 200ms
    await bucket.acquire(); // 1 消費
    await bucket.acquire(); // 2 消費
    await bucket.acquire(); // 3 消費

    // この時点でトークン 0 → 次の acquire は失敗するはず
    await expect(bucket.acquire()).rejects.toThrow("RATE_LIMITED");

    // resetForTest() でトークンを補充
    bucket.resetForTest(3);

    // 3 回 acquire できる
    await expect(bucket.acquire()).resolves.toBeUndefined();
    await expect(bucket.acquire()).resolves.toBeUndefined();
    await expect(bucket.acquire()).resolves.toBeUndefined();
  });
});

// ---------- notionRequest ----------

describe("notionRequest", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("NOTION_TOKEN が未設定だと getClient() がエラーを投げる", async () => {
    const original = process.env.NOTION_TOKEN;
    delete process.env.NOTION_TOKEN;

    try {
      const { _resetClientForTest, notionRequest } = await import(
        "@/server/adapters/notion/client"
      );
      _resetClientForTest();

      await expect(notionRequest(async () => "test")).rejects.toThrow(
        "NOTION_TOKEN が設定されていません",
      );
    } finally {
      if (original !== undefined) {
        process.env.NOTION_TOKEN = original;
      }
    }
  });

  it("fn の戻り値をそのまま返す", async () => {
    process.env.NOTION_TOKEN = "secret_test_token_for_unit_test";

    // Client クラスをモック (クラスベースで提供)
    vi.mock("@notionhq/client", () => ({
      Client: class MockClient {
        dataSources = { query: vi.fn() };
        pages = { create: vi.fn(), update: vi.fn() };
      },
    }));

    const { notionRequest, _resetClientForTest } = await import(
      "@/server/adapters/notion/client"
    );
    _resetClientForTest();

    const result = await notionRequest(async (_client) => "hello");
    expect(result).toBe("hello");
  });
});

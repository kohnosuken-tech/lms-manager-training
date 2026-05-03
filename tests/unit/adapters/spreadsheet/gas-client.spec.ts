/**
 * gas-client.ts のユニットテスト
 * - HMAC 署名の determinism
 * - URL クエリパラメータに ts / sig が付くこと
 * - 5xx 相当の非 JSON レスポンスでリトライすること
 * - HTML レスポンスを受け取ったら例外を投げること
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sign } from "@/server/adapters/spreadsheet/gas-client";

// callGas は fetch を内部で使う。vi.stubGlobal でモックに差し替える。
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // 環境変数を設定
  process.env.GAS_WEBAPP_URL = "https://script.example.com/macros/s/test/exec";
  process.env.GAS_SECRET = "test-secret-value";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.GAS_WEBAPP_URL;
  delete process.env.GAS_SECRET;
});

// ---- sign 関数のテスト ----

describe("sign()", () => {
  it("同じ入力に対して常に同じ署名を返す (deterministic)", () => {
    const ts = 1700000000000;
    const body = '{"action":"list_courses"}';
    const secret = "my-secret";

    const sig1 = sign(ts, body, secret);
    const sig2 = sign(ts, body, secret);

    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex = 64 文字
  });

  it("異なる timestamp で異なる署名を生成する", () => {
    const body = '{"action":"list_courses"}';
    const secret = "my-secret";

    const sig1 = sign(1700000000000, body, secret);
    const sig2 = sign(1700000000001, body, secret);

    expect(sig1).not.toBe(sig2);
  });

  it("異なる body で異なる署名を生成する", () => {
    const ts = 1700000000000;
    const secret = "my-secret";

    const sig1 = sign(ts, '{"action":"list_courses"}', secret);
    const sig2 = sign(ts, '{"action":"list_lessons"}', secret);

    expect(sig1).not.toBe(sig2);
  });
});

// ---- callGas のテスト ----

describe("callGas()", () => {
  // callGas を動的にインポートするためのヘルパー
  async function importCallGas() {
    // モジュールキャッシュをクリアして再インポート
    vi.resetModules();
    const mod = await import("@/server/adapters/spreadsheet/gas-client");
    return mod.callGas;
  }

  it("URL に ?ts= と ?sig= クエリパラメータが含まれること", async () => {
    mockFetch.mockResolvedValueOnce({
      text: async () => '{"ok":true,"data":[]}',
    });

    const callGas = await importCallGas();
    await callGas("list_courses");

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("?ts=");
    expect(calledUrl).toContain("sig=");
  });

  it("X-Timestamp と X-Signature ヘッダが送られること", async () => {
    mockFetch.mockResolvedValueOnce({
      text: async () => '{"ok":true,"data":[]}',
    });

    const callGas = await importCallGas();
    await callGas("list_courses");

    const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["X-Timestamp"]).toBeDefined();
    expect(headers["X-Signature"]).toBeDefined();
  });

  it("成功レスポンスを正しくパースして返す", async () => {
    const mockData = [{ id: "c1", title: "コース1" }];
    mockFetch.mockResolvedValueOnce({
      text: async () => JSON.stringify({ ok: true, data: mockData }),
    });

    const callGas = await importCallGas();
    const result = await callGas("list_courses");

    expect(result).toEqual({ ok: true, data: mockData });
  });

  it("非 JSON (HTML) レスポンスを受け取ったら例外を投げる", async () => {
    mockFetch.mockResolvedValueOnce({
      text: async () =>
        "<!DOCTYPE html><html><body>GAS Error</body></html>",
    });

    // 1 回目失敗 → リトライ 1 回 → どちらも HTML → 最終的に throw
    mockFetch.mockResolvedValueOnce({
      text: async () =>
        "<!DOCTYPE html><html><body>GAS Error</body></html>",
    });

    const callGas = await importCallGas();
    await expect(callGas("list_courses")).rejects.toThrow(
      "Non-JSON response from GAS",
    );
  });

  it("最初の呼び出しが失敗しても 1 回リトライして成功する", async () => {
    // 1 回目: 非 JSON (エラー)
    mockFetch.mockResolvedValueOnce({
      text: async () => "<!DOCTYPE html>Error</html>",
    });
    // 2 回目 (リトライ): 成功
    mockFetch.mockResolvedValueOnce({
      text: async () => '{"ok":true,"data":[]}',
    });

    const callGas = await importCallGas();
    const result = await callGas("list_courses");

    expect(result).toEqual({ ok: true, data: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("params が body の JSON に含まれること", async () => {
    mockFetch.mockResolvedValueOnce({
      text: async () => '{"ok":true,"data":[]}',
    });

    const callGas = await importCallGas();
    await callGas("list_lessons", { courseId: "course-123" });

    const calledOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(calledOptions.body as string) as Record<string, unknown>;
    expect(body.action).toBe("list_lessons");
    expect(body.courseId).toBe("course-123");
  });

  it("GAS_WEBAPP_URL が未設定の場合は例外を投げる", async () => {
    delete process.env.GAS_WEBAPP_URL;

    const callGas = await importCallGas();
    await expect(callGas("list_courses")).rejects.toThrow("GAS_WEBAPP_URL is not set");
  });

  it("GAS_SECRET が未設定の場合は例外を投げる", async () => {
    delete process.env.GAS_SECRET;

    const callGas = await importCallGas();
    await expect(callGas("list_courses")).rejects.toThrow("GAS_SECRET is not set");
  });
});

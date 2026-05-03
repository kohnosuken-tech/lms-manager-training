/**
 * spreadsheet/cms.ts のユニットテスト
 * - 各 list メソッドが gasClient を正しい action 名 + param で呼ぶこと
 * - TTL 内ではキャッシュが効いて gasClient が 1 回しか呼ばれないこと
 * - TTL を超えた後は再度 gasClient を呼ぶこと
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// gas-client をモック
vi.mock("@/server/adapters/spreadsheet/gas-client", () => ({
  callGas: vi.fn(),
}));

import { callGas } from "@/server/adapters/spreadsheet/gas-client";
import { spreadsheetCms, clearCmsCache } from "@/server/adapters/spreadsheet/cms";

const mockCallGas = vi.mocked(callGas);

beforeEach(() => {
  clearCmsCache();
  vi.clearAllMocks();
});

// ---- listCourses ----

describe("listCourses()", () => {
  it("action=list_courses で callGas を呼ぶ", async () => {
    const mockData = [{ id: "c1", title: "コース1" }];
    mockCallGas.mockResolvedValueOnce({ ok: true, data: mockData });

    const result = await spreadsheetCms.listCourses();

    expect(mockCallGas).toHaveBeenCalledOnce();
    expect(mockCallGas).toHaveBeenCalledWith("list_courses", {});
    expect(result).toEqual(mockData);
  });

  it("TTL 内では 2 回目の呼び出しにキャッシュを使う", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listCourses();
    await spreadsheetCms.listCourses();

    expect(mockCallGas).toHaveBeenCalledOnce();
  });

  it("GAS がエラーを返したら例外を投げる", async () => {
    mockCallGas.mockResolvedValueOnce({
      ok: false,
      error: { code: "INTERNAL", message: "sheet not found: Course" },
    });

    await expect(spreadsheetCms.listCourses()).rejects.toThrow(
      "GAS returned error for list_courses",
    );
  });
});

// ---- listLessons ----

describe("listLessons()", () => {
  it("courseId なしで action=list_lessons を呼ぶ", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listLessons();

    expect(mockCallGas).toHaveBeenCalledWith("list_lessons", {});
  });

  it("courseId ありで params に courseId を渡す", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listLessons("course-abc");

    expect(mockCallGas).toHaveBeenCalledWith("list_lessons", {
      courseId: "course-abc",
    });
  });

  it("courseId が異なればキャッシュが別になる", async () => {
    mockCallGas.mockResolvedValue({ ok: true, data: [] });

    await spreadsheetCms.listLessons("course-a");
    await spreadsheetCms.listLessons("course-b");

    // キャッシュキーが異なるため 2 回呼ばれる
    expect(mockCallGas).toHaveBeenCalledTimes(2);
  });

  it("同じ courseId なら 2 回目はキャッシュを使う", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listLessons("course-a");
    await spreadsheetCms.listLessons("course-a");

    expect(mockCallGas).toHaveBeenCalledOnce();
  });
});

// ---- listTests ----

describe("listTests()", () => {
  it("courseId ありで params に courseId を渡す", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listTests("course-xyz");

    expect(mockCallGas).toHaveBeenCalledWith("list_tests", {
      courseId: "course-xyz",
    });
  });

  it("courseId なしで空 params を渡す", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listTests();

    expect(mockCallGas).toHaveBeenCalledWith("list_tests", {});
  });
});

// ---- listQuestions ----

describe("listQuestions()", () => {
  it("testId ありで params に testId を渡す", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listQuestions("test-123");

    expect(mockCallGas).toHaveBeenCalledWith("list_questions", {
      testId: "test-123",
    });
  });
});

// ---- listChoices ----

describe("listChoices()", () => {
  it("questionId ありで params に questionId を渡す", async () => {
    mockCallGas.mockResolvedValueOnce({ ok: true, data: [] });

    await spreadsheetCms.listChoices("question-456");

    expect(mockCallGas).toHaveBeenCalledWith("list_choices", {
      questionId: "question-456",
    });
  });
});

// ---- キャッシュ TTL ----

describe("キャッシュ TTL", () => {
  it("clearCmsCache() 後は再度 callGas を呼ぶ", async () => {
    mockCallGas.mockResolvedValue({ ok: true, data: [] });

    await spreadsheetCms.listCourses();
    clearCmsCache();
    await spreadsheetCms.listCourses();

    expect(mockCallGas).toHaveBeenCalledTimes(2);
  });

  it("TTL 超過後は再度 callGas を呼ぶ", async () => {
    vi.useFakeTimers();

    mockCallGas.mockResolvedValue({ ok: true, data: [] });

    await spreadsheetCms.listCourses(); // callGas 1 回目 → キャッシュ格納
    // TTL (5 分) + 1ms 進める
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await spreadsheetCms.listCourses(); // TTL 超過 → callGas 2 回目

    vi.useRealTimers();

    expect(mockCallGas).toHaveBeenCalledTimes(2);
  });
});

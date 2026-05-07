/**
 * notion/cms.ts のユニットテスト
 *
 * @notionhq/client と rate-limiter をモックして、
 * listCourses / getCourse / listLessons / listTests / listQuestions / listChoices を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// モジュール全体をモック
vi.mock("@/server/adapters/notion/client", () => ({
  notionRequest: vi.fn(),
}));

vi.mock("@/server/adapters/notion/cache", () => ({
  cached: vi.fn(async (_key: string, _tier: string, fetchFn: () => Promise<unknown>) => fetchFn()),
  invalidate: vi.fn(),
  invalidatePrefix: vi.fn(),
  clearAllCache: vi.fn(),
}));

vi.mock("@/server/adapters/notion/db-helpers", () => ({
  queryAll: vi.fn(),
  createPage: vi.fn(),
  updatePage: vi.fn(),
  archivePage: vi.fn(),
}));

import { queryAll } from "@/server/adapters/notion/db-helpers";
import { notionCms } from "@/server/adapters/notion/cms";

const mockQueryAll = vi.mocked(queryAll);

// ---------- Notion page stub ヘルパー ----------

function makeRichText(value: string) {
  return { type: "rich_text", rich_text: [{ plain_text: value }] };
}

function makeTitle(value: string) {
  return { type: "title", title: [{ plain_text: value }] };
}

function makeNumber(value: number | null) {
  return { type: "number", number: value };
}

function makeCheckbox(value: boolean) {
  return { type: "checkbox", checkbox: value };
}

function makeDate(value: string) {
  return { type: "date", date: { start: value } };
}

function makeUrl(value: string) {
  return { type: "url", url: value };
}

function makeSelect(value: string) {
  return { type: "select", select: { name: value } };
}

function makeCoursePageStub(overrides: Record<string, unknown> = {}) {
  return {
    object: "page",
    id: "page-id-1",
    properties: {
      id:          makeRichText("course-1"),
      title:       makeTitle("テストコース"),
      description: makeRichText("説明"),
      order:       makeNumber(1),
      published:   makeCheckbox(true),
      createdAt:   makeDate("2024-01-01T00:00:00.000Z"),
      updatedAt:   makeDate("2024-01-01T00:00:00.000Z"),
      ...overrides,
    },
  };
}

function makeLessonPageStub(overrides: Record<string, unknown> = {}) {
  return {
    object: "page",
    id: "page-id-2",
    properties: {
      id:                     makeRichText("lesson-1"),
      title:                  makeTitle("テストレッスン"),
      courseId:               makeRichText("course-1"),
      description:            makeRichText(""),
      videoUrl:               makeUrl("https://example.com/video.mp4"),
      durationSec:            makeNumber(300),
      order:                  makeNumber(1),
      blockSeek:              makeCheckbox(false),
      requiredCompletionRate: makeNumber(0.95),
      createdAt:              makeDate("2024-01-01T00:00:00.000Z"),
      updatedAt:              makeDate("2024-01-01T00:00:00.000Z"),
      ...overrides,
    },
  };
}

function makeTestPageStub() {
  return {
    object: "page",
    id: "page-id-3",
    properties: {
      id:           makeRichText("test-1"),
      title:        makeTitle("テスト確認テスト"),
      courseId:     makeRichText("course-1"),
      passingScore: makeNumber(70),
      maxAttempts:  makeNumber(3),
      published:    makeCheckbox(true),
      createdAt:    makeDate("2024-01-01T00:00:00.000Z"),
      updatedAt:    makeDate("2024-01-01T00:00:00.000Z"),
    },
  };
}

function makeQuestionPageStub(typeValue = "SINGLE") {
  return {
    object: "page",
    id: "page-id-4",
    properties: {
      id:        makeRichText("question-1"),
      text:      makeTitle("Q1"),
      testId:    makeRichText("test-1"),
      order:     makeNumber(1),
      type:      makeSelect(typeValue),
      createdAt: makeDate("2024-01-01T00:00:00.000Z"),
      updatedAt: makeDate("2024-01-01T00:00:00.000Z"),
    },
  };
}

function makeChoicePageStub() {
  return {
    object: "page",
    id: "page-id-5",
    properties: {
      id:         makeRichText("choice-1"),
      text:       makeTitle("選択肢A"),
      questionId: makeRichText("question-1"),
      order:      makeNumber(1),
      isCorrect:  makeCheckbox(true),
      createdAt:  makeDate("2024-01-01T00:00:00.000Z"),
      updatedAt:  makeDate("2024-01-01T00:00:00.000Z"),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NOTION_DB_COURSE   = "test-course-db-id";
  process.env.NOTION_DB_LESSON   = "test-lesson-db-id";
  process.env.NOTION_DB_TEST     = "test-test-db-id";
  process.env.NOTION_DB_QUESTION = "test-question-db-id";
  process.env.NOTION_DB_CHOICE   = "test-choice-db-id";
});

// ---------- listCourses ----------

describe("notionCms.listCourses()", () => {
  it("Notion から Course 一覧を取得してマッピングする", async () => {
    mockQueryAll.mockResolvedValueOnce([makeCoursePageStub()] as never);
    const result = await notionCms.listCourses();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id:        "course-1",
      title:     "テストコース",
      published: true,
      order:     1,
    });
  });

  it("空の DB では空配列を返す", async () => {
    mockQueryAll.mockResolvedValueOnce([] as never);
    const result = await notionCms.listCourses();
    expect(result).toEqual([]);
  });
});

// ---------- getCourse ----------

describe("notionCms.getCourse()", () => {
  it("id が一致する Course を返す", async () => {
    mockQueryAll.mockResolvedValue([makeCoursePageStub()] as never);
    const result = await notionCms.getCourse("course-1");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("course-1");
  });

  it("id が存在しない場合 null を返す", async () => {
    mockQueryAll.mockResolvedValue([makeCoursePageStub()] as never);
    const result = await notionCms.getCourse("non-existent");
    expect(result).toBeNull();
  });
});

// ---------- listLessons ----------

describe("notionCms.listLessons()", () => {
  it("courseId でフィルタリングする", async () => {
    const lessonOther = makeLessonPageStub({
      id:       makeRichText("lesson-2"),
      courseId: makeRichText("other-course"),
    });
    mockQueryAll.mockResolvedValueOnce([makeLessonPageStub(), lessonOther] as never);

    const result = await notionCms.listLessons("course-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("lesson-1");
  });

  it("courseId 未指定では全 Lesson を返す", async () => {
    mockQueryAll.mockResolvedValueOnce([makeLessonPageStub()] as never);
    const result = await notionCms.listLessons();
    expect(result).toHaveLength(1);
  });
});

// ---------- listTests ----------

describe("notionCms.listTests()", () => {
  it("Test 一覧を取得できる", async () => {
    mockQueryAll.mockResolvedValueOnce([makeTestPageStub()] as never);
    const result = await notionCms.listTests();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "test-1", passingScore: 70 });
  });
});

// ---------- listQuestions ----------

describe("notionCms.listQuestions()", () => {
  it("Question の type が SINGLE になっている", async () => {
    mockQueryAll.mockResolvedValueOnce([makeQuestionPageStub("SINGLE")] as never);
    const result = await notionCms.listQuestions();
    expect(result[0]?.type).toBe("SINGLE");
  });

  it("MULTIPLE select の場合 type=MULTIPLE になる", async () => {
    mockQueryAll.mockResolvedValueOnce([makeQuestionPageStub("MULTIPLE")] as never);
    const result = await notionCms.listQuestions();
    expect(result[0]?.type).toBe("MULTIPLE");
  });
});

// ---------- listChoices ----------

describe("notionCms.listChoices()", () => {
  it("Choice の isCorrect が boolean になっている", async () => {
    mockQueryAll.mockResolvedValueOnce([makeChoicePageStub()] as never);
    const result = await notionCms.listChoices();
    expect(typeof result[0]?.isCorrect).toBe("boolean");
    expect(result[0]?.isCorrect).toBe(true);
  });
});

/**
 * sqlite/cms.ts のユニットテスト (Prisma SQLite 経由)
 * - listCourses / listLessons / listTests / listQuestions / listChoices の動作を検証
 * - Date が ISO 文字列に変換されること
 * - courseId / testId / questionId によるフィルタが機能すること
 */
import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "../../../helpers/db";
import { sqliteCms } from "@/server/adapters/sqlite/cms";

// テスト用フィクスチャ
let courseId1: string;
let courseId2: string;
let lessonId1: string;
let testId1: string;
let questionId1: string;
let choiceId1: string;

beforeEach(async () => {
  await resetDb();

  // コース 2 件
  const c1 = await testPrisma.course.create({
    data: {
      title: "コース A",
      description: "説明 A",
      order: 1,
      published: true,
    },
    select: { id: true },
  });
  courseId1 = c1.id;

  const c2 = await testPrisma.course.create({
    data: {
      title: "コース B",
      description: "説明 B",
      order: 2,
      published: false,
    },
    select: { id: true },
  });
  courseId2 = c2.id;

  // レッスン (コース A に紐付け)
  const l1 = await testPrisma.lesson.create({
    data: {
      courseId: courseId1,
      title: "レッスン 1",
      description: "レッスン説明",
      videoUrl: "/sample.mp4",
      durationSec: 120,
      order: 1,
      blockSeek: false,
      requiredCompletionRate: 0.8,
    },
    select: { id: true },
  });
  lessonId1 = l1.id;

  // テスト (コース A に紐付け)
  const t1 = await testPrisma.test.create({
    data: {
      courseId: courseId1,
      title: "テスト 1",
      passingScore: 70,
      maxAttempts: 3,
      published: true,
    },
    select: { id: true },
  });
  testId1 = t1.id;

  // 設問
  const q1 = await testPrisma.question.create({
    data: {
      testId: testId1,
      type: "SINGLE",
      prompt: "設問文 1",
      order: 1,
    },
    select: { id: true },
  });
  questionId1 = q1.id;

  // 選択肢
  const ch1 = await testPrisma.choice.create({
    data: {
      questionId: questionId1,
      label: "選択肢 A",
      correct: true,
      order: 1,
    },
    select: { id: true },
  });
  choiceId1 = ch1.id;
});

// ---- listCourses ----

describe("listCourses()", () => {
  it("全コースを返す", async () => {
    const result = await sqliteCms.listCourses();

    expect(result).toHaveLength(2);
    const ids = result.map((c) => c.id);
    expect(ids).toContain(courseId1);
    expect(ids).toContain(courseId2);
  });

  it("createdAt が ISO 文字列で返る", async () => {
    const result = await sqliteCms.listCourses();
    const course = result.find((c) => c.id === courseId1);

    expect(course).toBeDefined();
    expect(typeof course!.createdAt).toBe("string");
    // ISO8601 形式チェック (Z または +00:00 で終わる)
    expect(course!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("published フィールドが boolean で返る", async () => {
    const result = await sqliteCms.listCourses();
    const published = result.find((c) => c.id === courseId1);
    const unpublished = result.find((c) => c.id === courseId2);

    expect(published!.published).toBe(true);
    expect(unpublished!.published).toBe(false);
  });
});

// ---- listLessons ----

describe("listLessons()", () => {
  it("全レッスンを返す (courseId なし)", async () => {
    const result = await sqliteCms.listLessons();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(lessonId1);
  });

  it("courseId でフィルタされる", async () => {
    const result = await sqliteCms.listLessons(courseId1);
    expect(result).toHaveLength(1);
    expect(result[0]!.courseId).toBe(courseId1);
  });

  it("存在しない courseId では空配列を返す", async () => {
    const result = await sqliteCms.listLessons("nonexistent");
    expect(result).toHaveLength(0);
  });

  it("courseId2 には紐付いたレッスンがないので空配列", async () => {
    const result = await sqliteCms.listLessons(courseId2);
    expect(result).toHaveLength(0);
  });

  it("durationSec が number で返る", async () => {
    const result = await sqliteCms.listLessons(courseId1);
    expect(typeof result[0]!.durationSec).toBe("number");
    expect(result[0]!.durationSec).toBe(120);
  });

  it("requiredCompletionRate が number で返る", async () => {
    const result = await sqliteCms.listLessons(courseId1);
    expect(result[0]!.requiredCompletionRate).toBe(0.8);
  });
});

// ---- listTests ----

describe("listTests()", () => {
  it("全テストを返す (courseId なし)", async () => {
    const result = await sqliteCms.listTests();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(testId1);
  });

  it("courseId でフィルタされる", async () => {
    const result = await sqliteCms.listTests(courseId1);
    expect(result).toHaveLength(1);
  });

  it("courseId2 には紐付いたテストがないので空配列", async () => {
    const result = await sqliteCms.listTests(courseId2);
    expect(result).toHaveLength(0);
  });

  it("passingScore と maxAttempts が number で返る", async () => {
    const result = await sqliteCms.listTests(courseId1);
    expect(result[0]!.passingScore).toBe(70);
    expect(result[0]!.maxAttempts).toBe(3);
  });
});

// ---- listQuestions ----

describe("listQuestions()", () => {
  it("全設問を返す (testId なし)", async () => {
    const result = await sqliteCms.listQuestions();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(questionId1);
  });

  it("testId でフィルタされる", async () => {
    const result = await sqliteCms.listQuestions(testId1);
    expect(result).toHaveLength(1);
    expect(result[0]!.testId).toBe(testId1);
  });

  it("存在しない testId では空配列", async () => {
    const result = await sqliteCms.listQuestions("nonexistent");
    expect(result).toHaveLength(0);
  });

  it("text フィールドに prompt が入る", async () => {
    const result = await sqliteCms.listQuestions(testId1);
    expect(result[0]!.text).toBe("設問文 1");
  });

  it("type が SINGLE | MULTIPLE の文字列で返る", async () => {
    const result = await sqliteCms.listQuestions(testId1);
    expect(result[0]!.type).toBe("SINGLE");
  });
});

// ---- listChoices ----

describe("listChoices()", () => {
  it("全選択肢を返す (questionId なし)", async () => {
    const result = await sqliteCms.listChoices();
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(choiceId1);
  });

  it("questionId でフィルタされる", async () => {
    const result = await sqliteCms.listChoices(questionId1);
    expect(result).toHaveLength(1);
    expect(result[0]!.questionId).toBe(questionId1);
  });

  it("text フィールドに label が入る", async () => {
    const result = await sqliteCms.listChoices(questionId1);
    expect(result[0]!.text).toBe("選択肢 A");
  });

  it("isCorrect が boolean で返る", async () => {
    const result = await sqliteCms.listChoices(questionId1);
    expect(result[0]!.isCorrect).toBe(true);
  });
});

/**
 * test.ts — CmsPort 経由の read 動作テスト
 *
 * モック CmsPort を注入して startSubmission の Lesson 一覧取得が
 * CMS 経由で動くことを検証する。
 *
 * Phase E: Test / Lesson / Course は Prisma から削除済み。
 * Enrollment / Progress / Submission のみ Prisma で管理する。
 * CmsPort モックで Test / Lesson / Course 情報を提供する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { startSubmission } from "@/server/services/test";
import { AppError } from "@/lib/errors";
import type { CmsPort, Test, Lesson } from "@/server/ports/cms";

// container の audit/logger を noop にする
vi.mock("@/server/container", () => ({
  container: {
    audit:  { write: vi.fn().mockResolvedValue(undefined) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cms:    null, // テストでは明示的に cms を渡す
  },
}));

// ---------- モック CmsPort ファクトリ ----------

const now = new Date().toISOString();

function makeMockCms(opts: {
  tests?:   Test[];
  lessons?: Lesson[];
}): CmsPort {
  const tests   = opts.tests   ?? [];
  const lessons = opts.lessons ?? [];
  return {
    listCourses:   vi.fn().mockResolvedValue([]),
    listLessons:   vi.fn().mockImplementation((courseId?: string) =>
      Promise.resolve(
        courseId ? lessons.filter((l) => l.courseId === courseId) : lessons,
      ),
    ),
    listTests:     vi.fn().mockResolvedValue(tests),
    listQuestions: vi.fn().mockResolvedValue([]),
    listChoices:   vi.fn().mockResolvedValue([]),
    getCourse:     vi.fn().mockResolvedValue(null),
    getLesson:     vi.fn().mockImplementation((id: string) =>
      Promise.resolve(lessons.find((l) => l.id === id) ?? null),
    ),
    getTest:       vi.fn().mockImplementation((id: string) =>
      Promise.resolve(tests.find((t) => t.id === id) ?? null),
    ),
    getQuestion:   vi.fn().mockResolvedValue(null),
  };
}

function makeLesson(overrides: Partial<Lesson> & { id: string; courseId: string }): Lesson {
  return {
    title:                  "レッスン",
    description:            "",
    videoUrl:               "/sample.mp4",
    durationSec:            60,
    order:                  0,
    blockSeek:              false,
    requiredCompletionRate: null,
    createdAt:              now,
    updatedAt:              now,
    ...overrides,
  };
}

function makeTest(overrides: Partial<Test> & { id: string; courseId: string }): Test {
  return {
    title:        "テスト",
    passingScore: 70,
    maxAttempts:  3,
    published:    true,
    createdAt:    now,
    updatedAt:    now,
    ...overrides,
  };
}

// ---------- DB フィクスチャ (User + Enrollment + Progress のみ) ----------

async function setupFixture(courseId: string, lessonIds: string[], testId: string) {
  const user = await testPrisma.user.create({
    data: { email: "cms-test@example.com", name: "CMSテストユーザー", role: "STUDENT" },
    select: { id: true },
  });
  // Enrollment だけ Prisma に作成 (Course は Prisma に不要)
  await testPrisma.enrollment.create({
    data: { userId: user.id, courseId },
  });

  // lessonIds / testId は使わない (CmsPort モック側で管理)
  void lessonIds;
  void testId;

  return { userId: user.id };
}

// ---------- テスト ----------

describe("startSubmission — CmsPort 経由の Test / Lesson 取得", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("CmsPort が Test を返さない場合は NOT_FOUND エラー", async () => {
    const cms = makeMockCms({ tests: [] });

    await expect(
      startSubmission("any-user", "nonexistent-test", cms),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("CmsPort が published=false の Test を返す場合は NOT_FOUND エラー", async () => {
    const cms = makeMockCms({
      tests: [makeTest({ id: "t-unpub", courseId: "c1", published: false })],
    });

    await expect(
      startSubmission("any-user", "t-unpub", cms),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("CmsPort の listLessons が空を返す場合は PREREQUISITE_NOT_MET エラー", async () => {
    const courseId = "c-empty";
    const testId   = "t-empty";
    const { userId } = await setupFixture(courseId, ["l-dummy"], testId);

    // CmsPort は Lesson なしを返す
    const cms = makeMockCms({
      tests:   [makeTest({ id: testId, courseId })],
      lessons: [], // CmsPort 側に Lesson なし
    });

    await expect(
      startSubmission(userId, testId, cms),
    ).rejects.toMatchObject({ code: "PREREQUISITE_NOT_MET" });
  });

  it("CmsPort の listLessons が返す Lesson を全て完了済みなら受験開始できる", async () => {
    const courseId = "c-ok";
    const lessonId = "l-ok";
    const testId   = "t-ok";
    const { userId } = await setupFixture(courseId, [lessonId], testId);

    // Progress を完了状態にする
    await testPrisma.progress.create({
      data: {
        userId,
        lessonId,
        watchedSec:  60,
        completed:   true,
        completedAt: new Date(),
      },
    });

    const cms = makeMockCms({
      tests:   [makeTest({ id: testId, courseId })],
      lessons: [makeLesson({ id: lessonId, courseId })],
    });

    const result = await startSubmission(userId, testId, cms);

    expect(result.resumed).toBe(false);
    expect(typeof result.submissionId).toBe("string");
  });

  it("CmsPort の getTest が呼ばれること", async () => {
    const cms = makeMockCms({ tests: [] });
    const getTestSpy = vi.spyOn(cms, "getTest");

    await startSubmission("user", "test-id", cms).catch(() => {
      // NOT_FOUND は想定内
    });

    expect(getTestSpy).toHaveBeenCalledWith("test-id");
  });

  it("未完了 Lesson がある場合は PREREQUISITE_NOT_MET エラー", async () => {
    const courseId  = "c-partial";
    const lessonId1 = "l-partial-1";
    const lessonId2 = "l-partial-2";
    const testId    = "t-partial";
    const { userId } = await setupFixture(courseId, [lessonId1, lessonId2], testId);

    // lessonId1 だけ完了
    await testPrisma.progress.create({
      data: {
        userId,
        lessonId:    lessonId1,
        watchedSec:  60,
        completed:   true,
        completedAt: new Date(),
      },
    });

    const cms = makeMockCms({
      tests: [makeTest({ id: testId, courseId })],
      lessons: [
        makeLesson({ id: lessonId1, courseId }),
        makeLesson({ id: lessonId2, courseId, order: 1 }),
      ],
    });

    await expect(
      startSubmission(userId, testId, cms),
    ).rejects.toMatchObject({ code: "PREREQUISITE_NOT_MET" });
  });
});

/**
 * upsertProgress の requiredCompletionRate 境界値テスト
 *
 * デフォルト 0.95 / カスタム値でのエッジケースを検証する。
 *
 * Phase E: Course / Lesson は Prisma から削除済み。
 * CmsPort モックを注入して Lesson 情報を提供する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { upsertProgress } from "@/server/services/progress";
import type { CmsPort, Lesson } from "@/server/ports/cms";

// container の logger を noop にする
vi.mock("@/server/container", () => ({
  container: {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cms: null, // テストでは明示的に cms を渡す
  },
}));

// ---------- CmsPort モックファクトリ ----------

const now = new Date().toISOString();

function makeLesson(overrides: Partial<Lesson> & { id: string }): Lesson {
  return {
    courseId:               "course-progress-test",
    title:                  "テストレッスン",
    description:            "",
    videoUrl:               "/sample.mp4",
    durationSec:            100,
    order:                  0,
    blockSeek:              false,
    requiredCompletionRate: null,
    createdAt:              now,
    updatedAt:              now,
    ...overrides,
  };
}

function makeMockCms(lessons: Lesson[]): CmsPort {
  return {
    listCourses:   vi.fn().mockResolvedValue([]),
    listLessons:   vi.fn().mockResolvedValue(lessons),
    listTests:     vi.fn().mockResolvedValue([]),
    listQuestions: vi.fn().mockResolvedValue([]),
    listChoices:   vi.fn().mockResolvedValue([]),
    getCourse:     vi.fn().mockResolvedValue(null),
    getLesson:     vi.fn().mockImplementation((id: string) =>
      Promise.resolve(lessons.find((l) => l.id === id) ?? null),
    ),
    getTest:       vi.fn().mockResolvedValue(null),
    getQuestion:   vi.fn().mockResolvedValue(null),
  };
}

// ---------- セットアップヘルパー ----------

async function setupUser(): Promise<string> {
  const user = await testPrisma.user.create({
    data: { email: "progress-user@example.com", name: "進捗ユーザー", role: "STUDENT" },
    select: { id: true },
  });
  return user.id;
}

describe("upsertProgress — requiredCompletionRate 境界値", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("デフォルト 0.95: watchedSec が durationSec の 95% ちょうどで completed=true になる", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-95";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 100 })]);

    const result = await upsertProgress(userId, lessonId, 95, 95, cms);

    expect(result.completed).toBe(true);
  });

  it("デフォルト 0.95: 94% では completed=false になる", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-94";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 100 })]);

    const result = await upsertProgress(userId, lessonId, 94, 94, cms);

    expect(result.completed).toBe(false);
  });

  it("カスタム 0.5: watchedSec が durationSec の 50% ちょうどで completed=true になる", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-50";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 200, requiredCompletionRate: 0.5 })]);

    const result = await upsertProgress(userId, lessonId, 100, 100, cms);

    expect(result.completed).toBe(true);
  });

  it("カスタム 0.5: 49% では completed=false になる", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-49";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 200, requiredCompletionRate: 0.5 })]);

    const result = await upsertProgress(userId, lessonId, 98, 98, cms);

    expect(result.completed).toBe(false);
  });

  it("一度 completed=true になった後、watchedSec を後退させても completed=true を維持する", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-maintain";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 100 })]);

    // 最初に 95 秒視聴して完了させる
    await upsertProgress(userId, lessonId, 95, 95, cms);

    // 次回はより小さい値で更新を試みる (watchedSec は単調増加なので更新されない)
    const result = await upsertProgress(userId, lessonId, 10, 10, cms);

    expect(result.completed).toBe(true);
  });

  it("watchedSec が 0 のとき completed=false になる", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-zero";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 100 })]);

    const result = await upsertProgress(userId, lessonId, 0, 0, cms);

    expect(result.completed).toBe(false);
  });

  it("durationSec=0 のレッスンでは completed=false になる (ゼロ除算回避)", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-dur0";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 0 })]);

    const result = await upsertProgress(userId, lessonId, 0, 0, cms);

    expect(result.completed).toBe(false);
  });

  it("watchedSec は単調増加: 後退値は無視されて既存の大きい値が維持される", async () => {
    const userId = await setupUser();
    const lessonId = "lesson-monotonic";
    const cms = makeMockCms([makeLesson({ id: lessonId, durationSec: 100 })]);

    await upsertProgress(userId, lessonId, 80, 80, cms);
    await upsertProgress(userId, lessonId, 30, 30, cms); // 後退: 無視されるはず

    const progress = await testPrisma.progress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { watchedSec: true },
    });

    expect(progress?.watchedSec).toBe(80);
  });

  it("Lesson が CmsPort に存在しない場合は LESSON_NOT_FOUND エラーが発生する", async () => {
    const userId = await setupUser();
    const cms = makeMockCms([]); // Lesson なし

    await expect(
      upsertProgress(userId, "nonexistent-lesson", 50, 50, cms),
    ).rejects.toMatchObject({ code: "LESSON_NOT_FOUND" });
  });
});

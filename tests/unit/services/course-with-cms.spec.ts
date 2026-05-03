/**
 * course.ts — CmsPort 経由の read 系動作テスト
 *
 * モック CmsPort を注入して listCourses が CMS 経由で動くことを検証する。
 * - sqlite モードではフィルタ / カウントが正しく動作する
 * - CmsPort が空を返したときは空配列になる
 * - Enrollment カウントが Prisma から補完される
 *
 * Phase E: Course は Prisma から削除済み。
 * Enrollment カウントテストでは Enrollment のみ Prisma に作成する。
 * Enrollment.courseId は string FK として参照整合性なしで保存できる。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { listCourses } from "@/server/services/course";
import type { CmsPort, Course, Lesson } from "@/server/ports/cms";

// container の audit/logger/mail を noop にする
vi.mock("@/server/container", () => ({
  container: {
    audit:  { write: vi.fn().mockResolvedValue(undefined) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    mail:   { send: vi.fn().mockResolvedValue(undefined) },
    cms:    null, // テストでは明示的に cms を渡す
  },
}));

// ---------- テスト用モック CmsPort ファクトリ ----------

function makeMockCms(courses: Course[], lessons: Lesson[] = []): CmsPort {
  return {
    listCourses:   vi.fn().mockResolvedValue(courses),
    listLessons:   vi.fn().mockResolvedValue(lessons),
    listTests:     vi.fn().mockResolvedValue([]),
    listQuestions: vi.fn().mockResolvedValue([]),
    listChoices:   vi.fn().mockResolvedValue([]),
    getCourse:     vi.fn().mockImplementation((id: string) =>
      Promise.resolve(courses.find((c) => c.id === id) ?? null),
    ),
    getLesson:     vi.fn().mockImplementation((id: string) =>
      Promise.resolve(lessons.find((l) => l.id === id) ?? null),
    ),
    getTest:       vi.fn().mockResolvedValue(null),
    getQuestion:   vi.fn().mockResolvedValue(null),
  };
}

const now = new Date().toISOString();

function makeCourse(overrides: Partial<Course> & { id: string; title: string }): Course {
  return {
    description: "",
    order:       0,
    published:   true,
    createdAt:   now,
    updatedAt:   now,
    ...overrides,
  };
}

// ---------- テスト ----------

describe("listCourses — CmsPort 経由の read 動作", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("モック CmsPort が返した Course 一覧がそのまま返る", async () => {
    const mockCourses = [
      makeCourse({ id: "c1", title: "コース A", order: 1 }),
      makeCourse({ id: "c2", title: "コース B", order: 2 }),
    ];
    const cms = makeMockCms(mockCourses);

    const result = await listCourses({}, cms);

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("published=true フィルタが CmsPort の返した Course に適用される", async () => {
    const mockCourses = [
      makeCourse({ id: "c1", title: "公開コース",   order: 1, published: true }),
      makeCourse({ id: "c2", title: "非公開コース", order: 2, published: false }),
    ];
    const cms = makeMockCms(mockCourses);

    const result = await listCourses({ published: true }, cms);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("c1");
  });

  it("q フィルタでタイトル部分一致が動く", async () => {
    const mockCourses = [
      makeCourse({ id: "c1", title: "Next.js 入門",    order: 1 }),
      makeCourse({ id: "c2", title: "TypeScript 基礎", order: 2 }),
      makeCourse({ id: "c3", title: "Next.js 応用",    order: 3 }),
    ];
    const cms = makeMockCms(mockCourses);

    const result = await listCourses({ q: "Next.js" }, cms);

    expect(result).toHaveLength(2);
    expect(result.every((c) => c.title.includes("Next.js"))).toBe(true);
  });

  it("CmsPort が空を返すと空配列になる", async () => {
    const cms = makeMockCms([]);

    const result = await listCourses({}, cms);

    expect(result).toHaveLength(0);
  });

  it("Enrollment カウントが Prisma から正しく補完される", async () => {
    // Phase E: Course は Prisma に不要。Enrollment は string FK で直接作成する。
    const courseId = "c-enroll";
    const user1 = await testPrisma.user.create({
      data: { email: "u1@example.com", name: "U1", role: "STUDENT" },
      select: { id: true },
    });
    const user2 = await testPrisma.user.create({
      data: { email: "u2@example.com", name: "U2", role: "STUDENT" },
      select: { id: true },
    });
    await testPrisma.enrollment.createMany({
      data: [
        { userId: user1.id, courseId },
        { userId: user2.id, courseId },
      ],
    });

    // CmsPort は Enrollment と同じ courseId を持つ Course を返す
    const mockCourses = [
      makeCourse({ id: courseId, title: "受講コース", order: 0 }),
    ];
    const cms = makeMockCms(mockCourses);

    const result = await listCourses({}, cms);

    expect(result).toHaveLength(1);
    expect(result[0]!._count.enrollments).toBe(2);
  });

  it("Lesson カウントが CmsPort の listLessons から集計される", async () => {
    const mockCourses = [
      makeCourse({ id: "c-lesson", title: "レッスンコース", order: 0 }),
    ];
    const mockLessons: Lesson[] = [
      {
        id:                     "l1",
        courseId:               "c-lesson",
        title:                  "レッスン 1",
        description:            "",
        videoUrl:               "/sample.mp4",
        durationSec:            60,
        order:                  0,
        blockSeek:              false,
        requiredCompletionRate: null,
        createdAt:              now,
        updatedAt:              now,
      },
      {
        id:                     "l2",
        courseId:               "c-lesson",
        title:                  "レッスン 2",
        description:            "",
        videoUrl:               "/sample.mp4",
        durationSec:            120,
        order:                  1,
        blockSeek:              false,
        requiredCompletionRate: null,
        createdAt:              now,
        updatedAt:              now,
      },
    ];
    const cms = makeMockCms(mockCourses, mockLessons);

    const result = await listCourses({}, cms);

    expect(result).toHaveLength(1);
    expect(result[0]!._count.lessons).toBe(2);
  });

  it("order ソートが正しく適用される", async () => {
    const mockCourses = [
      makeCourse({ id: "c3", title: "コース C", order: 3 }),
      makeCourse({ id: "c1", title: "コース A", order: 1 }),
      makeCourse({ id: "c2", title: "コース B", order: 2 }),
    ];
    const cms = makeMockCms(mockCourses);

    const result = await listCourses({}, cms);

    expect(result.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });
});

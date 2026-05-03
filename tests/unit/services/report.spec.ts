/**
 * getAdminDashboard の集計値検算テスト
 *
 * fixture を注入して completionRate / overallCompletionRate / testPassRate を assert する。
 *
 * Phase E: Course / Test は Prisma から削除済み。
 * - CmsPort モックを注入して Course 一覧を提供する。
 * - Enrollment / Submission は Prisma に直接作成 (string FK として)。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { getAdminDashboard } from "@/server/services/report";
import type { CmsPort, Course } from "@/server/ports/cms";

const now = new Date().toISOString();

function makeMockCms(courses: Course[]): CmsPort {
  return {
    listCourses:   vi.fn().mockResolvedValue(courses),
    listLessons:   vi.fn().mockResolvedValue([]),
    listTests:     vi.fn().mockResolvedValue([]),
    listQuestions: vi.fn().mockResolvedValue([]),
    listChoices:   vi.fn().mockResolvedValue([]),
    getCourse:     vi.fn().mockImplementation((id: string) =>
      Promise.resolve(courses.find((c) => c.id === id) ?? null),
    ),
    getLesson:     vi.fn().mockResolvedValue(null),
    getTest:       vi.fn().mockResolvedValue(null),
    getQuestion:   vi.fn().mockResolvedValue(null),
  };
}

function makeCourse(id: string, title: string): Course {
  return { id, title, description: "", order: 0, published: true, createdAt: now, updatedAt: now };
}

describe("getAdminDashboard", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("Enrollment が 0 件のとき全体の completionRate は 0% になる", async () => {
    const cms = makeMockCms([]);
    const data = await getAdminDashboard(cms);

    expect(data.totalEnrollments).toBe(0);
    expect(data.completedEnrollments).toBe(0);
    expect(data.overallCompletionRate).toBe(0);
    expect(data.testPassRateLast30Days).toBe(0);
  });

  it("全員完了の場合 overallCompletionRate が 100% になる", async () => {
    const courseId = "course-a";
    const cms = makeMockCms([makeCourse(courseId, "コース A")]);

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
        { userId: user1.id, courseId, completedAt: new Date() },
        { userId: user2.id, courseId, completedAt: new Date() },
      ],
    });

    const data = await getAdminDashboard(cms);

    expect(data.totalEnrollments).toBe(2);
    expect(data.completedEnrollments).toBe(2);
    expect(data.overallCompletionRate).toBe(100);
  });

  it("半分完了の場合 overallCompletionRate が 50% になる", async () => {
    const courseId = "course-b";
    const cms = makeMockCms([makeCourse(courseId, "コース B")]);

    const users = await Promise.all([
      testPrisma.user.create({ data: { email: "u3@example.com", name: "U3", role: "STUDENT" }, select: { id: true } }),
      testPrisma.user.create({ data: { email: "u4@example.com", name: "U4", role: "STUDENT" }, select: { id: true } }),
    ]);

    await testPrisma.enrollment.createMany({
      data: [
        { userId: users[0]!.id, courseId, completedAt: new Date() }, // 完了
        { userId: users[1]!.id, courseId, completedAt: null },        // 未完了
      ],
    });

    const data = await getAdminDashboard(cms);

    expect(data.totalEnrollments).toBe(2);
    expect(data.completedEnrollments).toBe(1);
    expect(data.overallCompletionRate).toBe(50);
  });

  it("コースごとの completionRate が正しく算出される", async () => {
    const courseId = "course-c";
    const cms = makeMockCms([makeCourse(courseId, "コース C")]);

    const users = await Promise.all([
      testPrisma.user.create({ data: { email: "u5@example.com", name: "U5", role: "STUDENT" }, select: { id: true } }),
      testPrisma.user.create({ data: { email: "u6@example.com", name: "U6", role: "STUDENT" }, select: { id: true } }),
      testPrisma.user.create({ data: { email: "u7@example.com", name: "U7", role: "STUDENT" }, select: { id: true } }),
    ]);

    await testPrisma.enrollment.createMany({
      data: [
        { userId: users[0]!.id, courseId, completedAt: new Date() }, // 完了
        { userId: users[1]!.id, courseId, completedAt: new Date() }, // 完了
        { userId: users[2]!.id, courseId, completedAt: null },        // 未完了
      ],
    });

    const data = await getAdminDashboard(cms);

    const rate = data.courseEnrollmentRates.find((r) => r.courseId === courseId);
    expect(rate).toBeDefined();
    expect(rate!.totalEnrollments).toBe(3);
    expect(rate!.completedEnrollments).toBe(2);
    expect(rate!.completionRate).toBe(67); // round(2/3 * 100) = 67
  });

  it("直近 30 日のテスト合格率が正しく計算される", async () => {
    const cms = makeMockCms([]);
    const testId = "test-d";
    const user = await testPrisma.user.create({
      data: { email: "u8@example.com", name: "U8", role: "STUDENT" },
      select: { id: true },
    });

    const submittedAt = new Date();

    // Submission は testId / userId を string FK で直接作成
    await testPrisma.submission.create({
      data: { testId, userId: user.id, status: "PASSED", score: 80, attemptNo: 1, submittedAt },
    });
    await testPrisma.submission.create({
      data: { testId, userId: user.id, status: "FAILED", score: 40, attemptNo: 2, submittedAt },
    });
    await testPrisma.submission.create({
      data: { testId, userId: user.id, status: "FAILED", score: 50, attemptNo: 3, submittedAt },
    });

    const data = await getAdminDashboard(cms);

    // PASSED=1, FAILED=2 → 1/3 = 33%
    expect(data.testPassRateLast30Days).toBe(33);
  });

  it("期限超過 Enrollment が正しくカウントされる", async () => {
    const courseId = "course-e";
    const cms = makeMockCms([makeCourse(courseId, "コース E")]);

    const users = await Promise.all([
      testPrisma.user.create({ data: { email: "u9@example.com", name: "U9", role: "STUDENT" }, select: { id: true } }),
      testPrisma.user.create({ data: { email: "u10@example.com", name: "U10", role: "STUDENT" }, select: { id: true } }),
    ]);

    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 日前

    await testPrisma.enrollment.createMany({
      data: [
        { userId: users[0]!.id, courseId, dueAt: pastDate, completedAt: null }, // 期限超過
        { userId: users[1]!.id, courseId, dueAt: pastDate, completedAt: new Date() }, // 期限超過だが完了済み
      ],
    });

    const data = await getAdminDashboard(cms);

    expect(data.overdueEnrollments).toBe(1);
  });
});

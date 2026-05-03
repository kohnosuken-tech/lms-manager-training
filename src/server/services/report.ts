/**
 * 管理者ダッシュボード用レポート集計サービス
 *
 * Course / Lesson / Test の参照は CmsPort 経由。
 * Enrollment / Submission の集計は Prisma を使い N+1 を避ける。
 */

import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import type { CmsPort } from "@/server/ports/cms";

export type CourseEnrollmentRate = {
  courseId: string;
  courseTitle: string;
  totalEnrollments: number;
  completedEnrollments: number;
  completionRate: number; // 0-100 (%)
};

export type AdminDashboardData = {
  /** 全 Enrollment 数 */
  totalEnrollments: number;
  /** 完了済み Enrollment 数 (completedAt != null) */
  completedEnrollments: number;
  /** 完了率 0-100 (%) */
  overallCompletionRate: number;
  /** コースごとの受講完了率 */
  courseEnrollmentRates: CourseEnrollmentRate[];
  /** 直近 30 日のテスト合格率 0-100 (%) */
  testPassRateLast30Days: number;
  /** 期限超過 (dueAt < now && completedAt = null) の Enrollment 件数 */
  overdueEnrollments: number;
};

export async function getAdminDashboard(
  cms: CmsPort = container.cms,
): Promise<AdminDashboardData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // CmsPort からコース一覧を取得
  const cmsCourses = await cms.listCourses();
  const courseIds = cmsCourses.map((c) => c.id);

  // 並列実行でレイテンシを最小化
  const [
    totalEnrollments,
    completedEnrollments,
    overdueEnrollments,
    enrollmentGroupData,
    submissionCounts,
  ] = await Promise.all([
    // 全 Enrollment 数
    prisma.enrollment.count(),

    // 完了済み Enrollment 数
    prisma.enrollment.count({
      where: { completedAt: { not: null } },
    }),

    // 期限超過 Enrollment 数
    prisma.enrollment.count({
      where: {
        dueAt: { lt: now },
        completedAt: null,
      },
    }),

    // コースごとの Enrollment 集計 (Prisma groupBy)
    // CmsPort 既知の courseId でフィルタ
    courseIds.length > 0
      ? prisma.enrollment.groupBy({
          by: ["courseId"],
          where: { courseId: { in: courseIds } },
          _count: { courseId: true },
        })
      : Promise.resolve([]),

    // 直近 30 日の Submission 集計
    prisma.submission.groupBy({
      by: ["status"],
      where: {
        submittedAt: { gte: thirtyDaysAgo },
        status: { in: ["PASSED", "SUBMITTED", "FAILED"] },
      },
      _count: { status: true },
    }),
  ]);

  // コースごとの完了済み Enrollment 数を別途集計
  const completedEnrollmentGroup =
    courseIds.length > 0
      ? await prisma.enrollment.groupBy({
          by: ["courseId"],
          where: { courseId: { in: courseIds }, completedAt: { not: null } },
          _count: { courseId: true },
        })
      : [];

  const totalByCoure = new Map(
    enrollmentGroupData.map((e) => [e.courseId, e._count.courseId]),
  );
  const completedByCourse = new Map(
    completedEnrollmentGroup.map((e) => [e.courseId, e._count.courseId]),
  );

  // コースごとの完了率を算出 (CmsPort の順序を維持)
  const courseEnrollmentRates: CourseEnrollmentRate[] = cmsCourses.map((c) => {
    const total = totalByCoure.get(c.id) ?? 0;
    const completed = completedByCourse.get(c.id) ?? 0;
    const completionRate =
      total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      courseId: c.id,
      courseTitle: c.title,
      totalEnrollments: total,
      completedEnrollments: completed,
      completionRate,
    };
  });

  // 全体の完了率
  const overallCompletionRate =
    totalEnrollments === 0
      ? 0
      : Math.round((completedEnrollments / totalEnrollments) * 100);

  // テスト合格率 (PASSED / (PASSED + SUBMITTED + FAILED))
  const passedCount =
    submissionCounts.find((s) => s.status === "PASSED")?._count.status ?? 0;
  const totalSubmissions = submissionCounts.reduce(
    (sum, s) => sum + s._count.status,
    0,
  );
  const testPassRateLast30Days =
    totalSubmissions === 0
      ? 0
      : Math.round((passedCount / totalSubmissions) * 100);

  return {
    totalEnrollments,
    completedEnrollments,
    overallCompletionRate,
    courseEnrollmentRates,
    testPassRateLast30Days,
    overdueEnrollments,
  };
}

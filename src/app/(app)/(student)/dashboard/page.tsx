import Link from "next/link";
import { Video, CheckCircle, PlayCircle, BookOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";

export const metadata = { title: "ダッシュボード | LMS" };

export default async function DashboardPage() {
  const user = await requireUser();

  // Enrollment を取得 (courseId のみ)
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id },
    orderBy: { assignedAt: "asc" },
  });

  // CmsPort からコース・レッスン・テストを一括取得 (N+1 回避)
  const [allCourses, allLessons, allTests] = await Promise.all([
    container.cms.listCourses(),
    container.cms.listLessons(),
    container.cms.listTests(),
  ]);

  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  // コースごとのレッスン一覧
  const lessonsByCourse = new Map<string, typeof allLessons>();
  for (const l of allLessons) {
    const arr = lessonsByCourse.get(l.courseId) ?? [];
    arr.push(l);
    lessonsByCourse.set(l.courseId, arr);
  }

  // コースごとの公開テスト一覧
  const testsByCourse = new Map<string, typeof allTests>();
  for (const t of allTests) {
    if (!t.published) continue;
    const arr = testsByCourse.get(t.courseId) ?? [];
    arr.push(t);
    testsByCourse.set(t.courseId, arr);
  }

  // ユーザーの全 Progress を一括取得 (N+1 回避)
  const enrolledLessonIds = enrollments.flatMap(
    (e) => (lessonsByCourse.get(e.courseId) ?? []).map((l) => l.id),
  );
  const progresses =
    enrolledLessonIds.length > 0
      ? await prisma.progress.findMany({
          where: { userId: user.id, lessonId: { in: enrolledLessonIds } },
          select: { lessonId: true, completed: true },
        })
      : [];
  const completedSet = new Set(
    progresses.filter((p) => p.completed).map((p) => p.lessonId),
  );

  // ユーザーの PASSED Submission を一括取得 (test pass バッジ用)
  const allTestIds = enrollments.flatMap(
    (e) => (testsByCourse.get(e.courseId) ?? []).map((t) => t.id),
  );
  const passedSubs =
    allTestIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            userId: user.id,
            testId: { in: allTestIds },
            status: "PASSED",
          },
          select: { testId: true },
        })
      : [];
  const passedTestSet = new Set(passedSubs.map((s) => s.testId));

  const courseCards = enrollments.map((e) => {
    const course = courseMap.get(e.courseId);
    const courseLessons = lessonsByCourse.get(e.courseId) ?? [];
    const courseTests = testsByCourse.get(e.courseId) ?? [];

    const total = courseLessons.length;
    const completed = courseLessons.filter((l) => completedSet.has(l.id)).length;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    const courseTestIds = courseTests.map((t) => t.id);
    const hasPassedTest = courseTestIds.some((tid) => passedTestSet.has(tid));

    return {
      id: e.courseId,
      title: course?.title ?? e.courseId,
      description: course?.description ?? "",
      total,
      completed,
      pct,
      hasTest: courseTestIds.length > 0,
      hasPassedTest,
    };
  });

  const completedCourses = courseCards.filter((c) => c.pct === 100).length;
  const inProgressCourses = courseCards.filter((c) => c.pct > 0 && c.pct < 100).length;

  return (
    <div className="space-y-8">
      {/* ウェルカムヘッダー */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          マイダッシュボード
        </h1>
        <p className="text-sm text-muted-foreground">
          {user.name} さん、こんにちは &nbsp;·&nbsp; 受講中 {inProgressCourses} コース &nbsp;·&nbsp; 完了 {completedCourses} コース
        </p>
      </div>

      {courseCards.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-card py-20 text-center">
          <BookOpen className="size-12 text-muted-foreground/30" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">コースがまだ割り当てられていません</p>
            <p className="text-sm text-muted-foreground">管理者がコースを割り当てるとここに表示されます。</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courseCards.map((c) => (
            <Link
              key={c.id}
              href={`/courses/${c.id}`}
              className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full overflow-hidden rounded-xl shadow-sm transition-shadow hover:shadow-md">
                {/* サムネイル風ヘッダー */}
                <div className="flex h-32 items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5 relative">
                  <Video className="size-10 text-primary/40" aria-hidden="true" />
                  {c.hasPassedTest && (
                    <div className="absolute top-3 right-3">
                      <Badge className="gap-1">
                        <CheckCircle className="size-3" aria-hidden="true" />
                        テスト合格
                      </Badge>
                    </div>
                  )}
                </div>

                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight group-hover:text-primary transition-colors">
                      {c.title}
                    </CardTitle>
                    <Badge
                      variant={c.pct === 100 ? "default" : "secondary"}
                      className="shrink-0"
                    >
                      {c.pct}%
                    </Badge>
                  </div>
                  {c.description ? (
                    <CardDescription className="line-clamp-2 text-xs">
                      {c.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>

                <CardContent className="space-y-3">
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={c.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${c.title} 進捗 ${c.pct}%`}
                  >
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {c.completed} / {c.total} レッスン完了
                      {c.hasTest ? " · テストあり" : ""}
                    </span>
                    <Button
                      asChild
                      size="xs"
                      variant={c.pct === 0 ? "default" : "outline"}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <span className="flex items-center gap-1">
                        <PlayCircle className="size-3" />
                        {c.pct === 0 ? "開始" : c.pct === 100 ? "復習" : "続ける"}
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

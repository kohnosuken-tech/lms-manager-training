import Link from "next/link";
import { notFound } from "next/navigation";
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

type Params = { id: string };

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [course, lessons, tests] = await Promise.all([
    container.cms.getCourse(id),
    container.cms.listLessons(id),
    container.cms.listTests(id),
  ]);
  if (!course) notFound();

  const sortedLessons = [...lessons].sort((a, b) => a.order - b.order);
  const publishedTests = tests
    .filter((t) => t.published)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // 進捗マップ取得 (N+1 回避)
  const lessonIds = sortedLessons.map((l) => l.id);
  const progresses =
    lessonIds.length > 0
      ? await prisma.progress.findMany({
          where: { userId: user.id, lessonId: { in: lessonIds } },
          select: {
            lessonId: true,
            watchedSec: true,
            completed: true,
          },
        })
      : [];
  const progressMap = new Map(progresses.map((p) => [p.lessonId, p]));
  const completedSet = new Set(
    progresses.filter((p) => p.completed).map((p) => p.lessonId),
  );
  const allLessonsCompleted =
    lessonIds.length > 0 && completedSet.size === lessonIds.length;

  // 各 Test の Submission サマリ
  const testSummaries = await Promise.all(
    publishedTests.map(async (t) => {
      const maxAttempts = t.maxAttempts ?? 3;
      const [latest, finishedCount, passed] = await Promise.all([
        prisma.submission.findFirst({
          where: { userId: user.id, testId: t.id },
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            score: true,
            attemptNo: true,
            submittedAt: true,
          },
        }),
        prisma.submission.count({
          where: {
            userId: user.id,
            testId: t.id,
            status: { in: ["PASSED", "FAILED", "SUBMITTED"] },
          },
        }),
        prisma.submission.findFirst({
          where: { userId: user.id, testId: t.id, status: "PASSED" },
          select: { id: true },
        }),
      ]);
      return {
        test: t,
        latest,
        finishedCount,
        passed: !!passed,
        remaining: Math.max(0, maxAttempts - finishedCount),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← ダッシュボード
        </Link>
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <p className="text-sm text-muted-foreground">{course.description}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">レッスン</h2>
        <div className="grid gap-3">
          {sortedLessons.map((l) => {
            const p = progressMap.get(l.id);
            const status: "DONE" | "IN_PROGRESS" | "NOT_STARTED" = p?.completed
              ? "DONE"
              : (p?.watchedSec ?? 0) > 0
                ? "IN_PROGRESS"
                : "NOT_STARTED";
            return (
              <Link
                key={l.id}
                href={`/courses/${course.id}/lessons/${l.id}`}
                className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Card className="transition-colors hover:bg-accent/40">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">
                        {l.order + 1}. {l.title}
                      </CardTitle>
                      {status === "DONE" ? (
                        <Badge>完了</Badge>
                      ) : status === "IN_PROGRESS" ? (
                        <Badge variant="secondary">視聴中</Badge>
                      ) : (
                        <Badge variant="outline">未開始</Badge>
                      )}
                    </div>
                    {l.description ? (
                      <CardDescription>{l.description}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    約 {Math.round((l.durationSec ?? 0) / 60)} 分
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {sortedLessons.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                レッスンが登録されていません。
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      {testSummaries.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">確認テスト</h2>
          <div className="grid gap-3">
            {testSummaries.map((s) => {
              const maxAttempts = s.test.maxAttempts ?? 3;
              const canTake =
                allLessonsCompleted && !s.passed && s.remaining > 0;
              return (
                <Card key={s.test.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">{s.test.title}</CardTitle>
                      {s.passed ? (
                        <Badge>合格</Badge>
                      ) : s.latest?.status === "FAILED" ? (
                        <Badge variant="destructive">不合格</Badge>
                      ) : s.latest ? (
                        <Badge variant="secondary">受験中</Badge>
                      ) : (
                        <Badge variant="outline">未受験</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="text-xs text-muted-foreground">
                      合格基準 {s.test.passingScore != null ? `${s.test.passingScore}%` : "-"} / 残り受験回数{" "}
                      {s.remaining} / {maxAttempts}
                    </div>
                    {s.latest ? (
                      <div className="text-xs">
                        最新: {s.latest.score ?? "-"} 点 (試行{" "}
                        {s.latest.attemptNo}){" "}
                        {s.latest.id ? (
                          <Link
                            href={`/submissions/${s.latest.id}`}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            結果を見る
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {s.passed ? (
                        <Button variant="outline" size="sm" disabled>
                          合格済み
                        </Button>
                      ) : canTake ? (
                        <Button asChild size="sm">
                          <Link href={`/tests/${s.test.id}`}>
                            {s.latest && s.latest.status === "FAILED"
                              ? "再受験する"
                              : "テストを受ける"}
                          </Link>
                        </Button>
                      ) : !allLessonsCompleted ? (
                        <Button variant="outline" size="sm" disabled>
                          全レッスン完了後に受験可能
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" disabled>
                            受験回数の上限に達しました
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            上限に達した場合は管理者にご連絡ください。
                          </p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

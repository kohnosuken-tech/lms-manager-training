import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { startTestAction } from "./actions";

type Params = { testId: string };
type SearchParams = { error?: string };

const ERROR_MESSAGES: Record<string, string> = {
  ATTEMPTS_EXCEEDED:
    "受験回数の上限に達しました。これ以上は受験できません。",
  PREREQUISITE_NOT_MET:
    "前提条件 (全レッスン完了など) を満たしていません。",
  CONFLICT:
    "このテストは既に合格済みです。",
};

export default async function TestEntryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const { testId } = await params;
  const { error } = await searchParams;

  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          lessons: { select: { id: true } },
        },
      },
    },
  });
  if (!test || !test.published) notFound();

  // Enrollment チェック (ADMIN は素通し)
  if (user.role !== "ADMIN") {
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: user.id, courseId: test.courseId },
      },
      select: { id: true },
    });
    if (!enrollment) redirect("/forbidden");
  }

  const lessonIds = test.course.lessons.map((l) => l.id);
  const completedLessons =
    lessonIds.length > 0
      ? await prisma.progress.count({
          where: {
            userId: user.id,
            lessonId: { in: lessonIds },
            completed: true,
          },
        })
      : 0;
  const allCompleted =
    lessonIds.length > 0 && completedLessons === lessonIds.length;

  const finishedAttempts = await prisma.submission.count({
    where: {
      userId: user.id,
      testId,
      status: { in: ["PASSED", "FAILED", "SUBMITTED"] },
    },
  });
  const remaining = Math.max(0, test.maxAttempts - finishedAttempts);
  const passed = await prisma.submission.findFirst({
    where: { userId: user.id, testId, status: "PASSED" },
    select: { id: true },
  });

  const blocked =
    !allCompleted || remaining === 0 || !!passed || !!error;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/courses/${test.courseId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {test.course.title}
        </Link>
        <h1 className="text-2xl font-semibold">{test.title}</h1>
        {test.description ? (
          <p className="text-sm text-muted-foreground">{test.description}</p>
        ) : null}
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">受験できません</CardTitle>
            <CardDescription>
              {ERROR_MESSAGES[error] ?? "受験を開始できませんでした。"}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>受験情報</CardTitle>
          <CardDescription>
            合格基準 {test.passingScore}% / 最大受験回数 {test.maxAttempts}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={allCompleted ? "default" : "outline"}>
              レッスン {completedLessons} / {lessonIds.length} 完了
            </Badge>
            <Badge variant="secondary">
              残り受験回数 {remaining} / {test.maxAttempts}
            </Badge>
            {passed ? <Badge>合格済み</Badge> : null}
          </div>

          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            <li>設問・選択肢はランダムにシャッフルされます。</li>
            <li>部分点はありません。問題ごとの正解集合と完全一致のみ正解。</li>
            <li>提出後に解説が表示されます。</li>
            {test.timeLimitSec ? (
              <li>制限時間: {Math.round(test.timeLimitSec / 60)} 分</li>
            ) : null}
          </ul>

          {!blocked ? (
            <form action={startTestAction}>
              <input type="hidden" name="testId" value={test.id} />
              <Button type="submit">テストを開始する</Button>
            </form>
          ) : passed ? (
            <Button disabled>合格済み</Button>
          ) : !allCompleted ? (
            <Button disabled>全レッスン完了後に受験可能</Button>
          ) : remaining === 0 ? (
            <Button disabled>受験回数の上限に達しました</Button>
          ) : (
            <Button disabled>受験できません</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/feature/VideoPlayer";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";

const DEFAULT_COMPLETION_RATE = 0.95;

type Params = { id: string; lessonId: string };

export default async function LessonPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id, lessonId } = await params;

  const [lesson, course] = await Promise.all([
    container.cms.getLesson(lessonId),
    container.cms.getCourse(id),
  ]);
  if (!lesson || lesson.courseId !== id) notFound();
  if (!course) notFound();

  // Enrollment チェック (ADMIN は素通し)
  if (user.role !== "ADMIN") {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: id } },
      select: { id: true },
    });
    if (!enrollment) redirect("/forbidden");
  }

  // 前後 Lesson + 自分の Progress を並列取得
  const [siblings, progress] = await Promise.all([
    container.cms.listLessons(id),
    prisma.progress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      select: {
        watchedSec: true,
        lastPositionSec: true,
        completed: true,
      },
    }),
  ]);

  const sortedSiblings = [...siblings].sort((a, b) => a.order - b.order);
  const idx = sortedSiblings.findIndex((l) => l.id === lessonId);
  const prev = idx > 0 ? sortedSiblings[idx - 1] : null;
  const next = idx >= 0 && idx < sortedSiblings.length - 1 ? sortedSiblings[idx + 1] : null;

  // コース全体の完了判定のために他のレッスンの進捗を取得
  const isLastLesson = next === null;

  // 他のレッスン ID (このレッスンを除く)
  const otherLessonIds = sortedSiblings.filter((l) => l.id !== lessonId).map((l) => l.id);

  // 最後のレッスンかつ他にレッスンがある場合のみ他の進捗を取得
  let allOthersCompleted = otherLessonIds.length === 0;
  if (isLastLesson && otherLessonIds.length > 0) {
    const otherProgresses = await prisma.progress.findMany({
      where: {
        userId: user.id,
        lessonId: { in: otherLessonIds },
        completed: true,
      },
      select: { lessonId: true },
    });
    allOthersCompleted = otherProgresses.length === otherLessonIds.length;
  }

  // このレッスンが最後 かつ 他のレッスンが全完了 → テスト誘導対象
  const willCompleteAll = isLastLesson && allOthersCompleted;

  // コースに紐づく公開済みテストを取得 (テスト誘導対象のときのみ)
  let courseTests: { id: string; title: string }[] = [];
  if (willCompleteAll) {
    const allTests = await container.cms.listTests(id);
    courseTests = allTests
      .filter((t) => t.published)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((t) => ({ id: t.id, title: t.title }));
  }

  const requiredRate = lesson.requiredCompletionRate ?? DEFAULT_COMPLETION_RATE;
  const simulateEnabled = process.env.NEXT_PUBLIC_SIMULATE_VIDEO === "true";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/courses/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {course.title}
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{lesson.title}</h1>
          {progress?.completed ? <Badge>完了</Badge> : null}
        </div>
        {lesson.description ? (
          <p className="text-sm text-muted-foreground">{lesson.description}</p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>動画プレーヤー</CardTitle>
          <CardDescription>
            10 秒ごとに進捗が自動保存されます。完了基準:{" "}
            {Math.round(requiredRate * 100)}% 視聴。
            {lesson.blockSeek ? " 早送り抑止: ON" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VideoPlayer
            lessonId={lesson.id}
            videoUrl={lesson.videoUrl}
            durationSec={lesson.durationSec ?? 0}
            blockSeek={lesson.blockSeek}
            initialLastPositionSec={progress?.lastPositionSec ?? 0}
            initialWatchedSec={progress?.watchedSec ?? 0}
            requiredCompletionRate={requiredRate}
            initialCompleted={progress?.completed ?? false}
            simulateEnabled={simulateEnabled}
          />
        </CardContent>
      </Card>

      {/* テスト誘導 CTA: コースの最後のレッスン + 他が全完了 + 公開テストがある場合 */}
      {willCompleteAll && courseTests.length > 0 ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">コース確認テストを受けましょう</CardTitle>
            <CardDescription>
              このレッスンを完了するとコース全体が完了になります。確認テストで理解度を確認してください。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {courseTests.length === 1 ? (
                <Button asChild>
                  <Link href={`/tests/${courseTests[0]!.id}`}>
                    {courseTests[0]!.title} を受ける
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild>
                    <Link href={`/tests/${courseTests[0]!.id}`}>
                      {courseTests[0]!.title} を受ける
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/courses/${id}`}>
                      テスト一覧を見る ({courseTests.length} 件)
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {prev ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/courses/${id}/lessons/${prev.id}`}>
              ← {prev.order + 1}. {prev.title}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            前のレッスンなし
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/courses/${id}`}>コース詳細に戻る</Link>
        </Button>
        {next ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/courses/${id}/lessons/${next.id}`}>
              {next.order + 1}. {next.title} →
            </Link>
          </Button>
        ) : willCompleteAll && courseTests.length > 0 ? (
          <Button asChild size="sm">
            <Link href={`/tests/${courseTests[0]!.id}`}>
              テストを受ける →
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            次のレッスンなし
          </Button>
        )}
      </div>
    </div>
  );
}

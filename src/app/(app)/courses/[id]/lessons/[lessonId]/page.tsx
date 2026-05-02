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

const DEFAULT_COMPLETION_RATE = 0.95;

type Params = { id: string; lessonId: string };

export default async function LessonPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id, lessonId } = await params;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: { select: { id: true, title: true } },
    },
  });
  if (!lesson || lesson.courseId !== id) notFound();

  // Enrollment チェック (ADMIN は素通し)
  if (user.role !== "ADMIN") {
    const enrollment = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: id } },
      select: { id: true },
    });
    if (!enrollment) redirect("/forbidden");
  }

  // 前後 Lesson + 自分の Progress
  const [siblings, progress] = await Promise.all([
    prisma.lesson.findMany({
      where: { courseId: id },
      orderBy: { order: "asc" },
      select: { id: true, order: true, title: true },
    }),
    prisma.progress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      select: {
        watchedSec: true,
        lastPositionSec: true,
        completed: true,
      },
    }),
  ]);

  const idx = siblings.findIndex((l) => l.id === lessonId);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  const requiredRate = lesson.requiredCompletionRate ?? DEFAULT_COMPLETION_RATE;
  const simulateEnabled = process.env.NEXT_PUBLIC_SIMULATE_VIDEO === "true";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/courses/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {lesson.course.title}
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
            durationSec={lesson.durationSec}
            blockSeek={lesson.blockSeek}
            initialLastPositionSec={progress?.lastPositionSec ?? 0}
            initialWatchedSec={progress?.watchedSec ?? 0}
            requiredCompletionRate={requiredRate}
            initialCompleted={progress?.completed ?? false}
            simulateEnabled={simulateEnabled}
          />
        </CardContent>
      </Card>

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
        ) : (
          <Button variant="outline" size="sm" disabled>
            次のレッスンなし
          </Button>
        )}
      </div>
    </div>
  );
}

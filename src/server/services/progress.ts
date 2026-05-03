import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { AppError } from "@/lib/errors";
import type { CmsPort } from "@/server/ports/cms";

const DEFAULT_COMPLETION_RATE = 0.95;

export type UpsertProgressResult = {
  completed: boolean;
};

/**
 * Lesson の進捗を upsert する。
 * 完了判定: watchedSec / durationSec >= (lesson.requiredCompletionRate ?? 0.95)
 *
 * 早送り抑止判定はここでは行わない (Route Handler 側で実施)。
 * lesson.durationSec / requiredCompletionRate は CmsPort 経由で取得する。
 */
export async function upsertProgress(
  userId: string,
  lessonId: string,
  watchedSec: number,
  lastPositionSec: number,
  cms: CmsPort = container.cms,
): Promise<UpsertProgressResult> {
  const lesson = await cms.getLesson(lessonId);
  if (!lesson) {
    // M-6: AppError に統一して API レスポンス整形ハンドラで適切に変換する
    throw new AppError("LESSON_NOT_FOUND", "レッスンが見つかりません。", 404);
  }

  // 既存 progress を取得 (watchedSec を後退させない)
  const existing = await prisma.progress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: {
      watchedSec: true,
      lastPositionSec: true,
      completed: true,
    },
  });

  // watchedSec は単調増加 (後退禁止)
  const newWatched = Math.max(existing?.watchedSec ?? 0, watchedSec);
  const newLastPosition = Math.max(0, lastPositionSec);

  const rate = lesson.requiredCompletionRate ?? DEFAULT_COMPLETION_RATE;
  const durationSec = lesson.durationSec ?? 0;
  const ratio = durationSec > 0 ? newWatched / durationSec : 0;
  const completed =
    existing?.completed === true ? true : ratio >= rate;
  const completedAt =
    completed && existing?.completed !== true ? new Date() : undefined;

  await prisma.progress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: {
      userId,
      lessonId,
      watchedSec: newWatched,
      lastPositionSec: newLastPosition,
      completed,
      completedAt: completed ? new Date() : null,
    },
    update: {
      watchedSec: newWatched,
      lastPositionSec: newLastPosition,
      ...(completed && existing?.completed !== true
        ? { completed: true, completedAt: completedAt ?? new Date() }
        : {}),
    },
  });

  if (completed && existing?.completed !== true) {
    container.logger.info("progress.completed", { userId, lessonId });
  }

  return { completed };
}

export type CourseProgressItem = {
  lessonId: string;
  watchedSec: number;
  lastPositionSec: number;
  completed: boolean;
};

export type CourseProgressSummary = {
  totalLessons: number;
  completedLessons: number;
  percent: number;
  items: CourseProgressItem[];
};

/**
 * Course 単位の進捗集計を返す (一覧画面で使用)。
 * Lesson 一覧は CmsPort 経由で取得する。
 */
export async function getCourseProgress(
  userId: string,
  courseId: string,
  cms: CmsPort = container.cms,
): Promise<CourseProgressSummary> {
  const cmsLessons = await cms.listLessons(courseId);
  // order 順にソート
  const lessons = [...cmsLessons].sort((a, b) => a.order - b.order);
  const lessonIds = lessons.map((l) => l.id);

  const progresses =
    lessonIds.length > 0
      ? await prisma.progress.findMany({
          where: { userId, lessonId: { in: lessonIds } },
          select: {
            lessonId: true,
            watchedSec: true,
            lastPositionSec: true,
            completed: true,
          },
        })
      : [];

  const map = new Map(progresses.map((p) => [p.lessonId, p]));
  const items: CourseProgressItem[] = lessons.map((l) => {
    const p = map.get(l.id);
    return {
      lessonId: l.id,
      watchedSec: p?.watchedSec ?? 0,
      lastPositionSec: p?.lastPositionSec ?? 0,
      completed: p?.completed ?? false,
    };
  });

  const completedLessons = items.filter((i) => i.completed).length;
  const totalLessons = items.length;
  const percent =
    totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

  return { totalLessons, completedLessons, percent, items };
}

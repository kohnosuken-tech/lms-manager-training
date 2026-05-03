/**
 * SQLite (Prisma) 経由の CmsPort 実装。
 * CMS_SOURCE=sqlite (デフォルト) 時に使用する。
 *
 * - 既存の prisma スキーマから CmsPort の型に変換する
 * - Date → ISO8601 文字列、number/boolean はそのまま
 * - N+1 を防ぐため select を明示
 */

import type {
  CmsPort,
  Course,
  Lesson,
  Test,
  Question,
  Choice,
} from "@/server/ports/cms";
import { prisma } from "@/server/repositories/db";

export const sqliteCms: CmsPort = {
  async listCourses(): Promise<Course[]> {
    const rows = await prisma.course.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        order: true,
        published: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      order: r.order,
      published: r.published,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async listLessons(courseId?: string): Promise<Lesson[]> {
    const rows = await prisma.lesson.findMany({
      where: courseId ? { courseId } : undefined,
      orderBy: [{ courseId: "asc" }, { order: "asc" }],
      select: {
        id: true,
        courseId: true,
        title: true,
        description: true,
        videoUrl: true,
        durationSec: true,
        order: true,
        blockSeek: true,
        requiredCompletionRate: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      title: r.title,
      description: r.description,
      videoUrl: r.videoUrl,
      durationSec: r.durationSec,
      order: r.order,
      blockSeek: r.blockSeek,
      requiredCompletionRate: r.requiredCompletionRate,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async listTests(courseId?: string): Promise<Test[]> {
    const rows = await prisma.test.findMany({
      where: courseId ? { courseId } : undefined,
      orderBy: [{ courseId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        courseId: true,
        title: true,
        passingScore: true,
        maxAttempts: true,
        published: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      title: r.title,
      passingScore: r.passingScore,
      maxAttempts: r.maxAttempts,
      published: r.published,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  async listQuestions(testId?: string): Promise<Question[]> {
    const rows = await prisma.question.findMany({
      where: testId ? { testId } : undefined,
      orderBy: [{ testId: "asc" }, { order: "asc" }],
      select: {
        id: true,
        testId: true,
        order: true,
        type: true,
        prompt: true,
        // Question モデルに createdAt / updatedAt がないため select しない
      },
    });
    // Prisma スキーマ上 Question に日時カラムがないため固定文字列を入れる
    const now = new Date().toISOString();
    return rows.map((r) => ({
      id: r.id,
      testId: r.testId,
      order: r.order,
      type: r.type as "SINGLE" | "MULTIPLE",
      text: r.prompt,
      createdAt: now,
      updatedAt: now,
    }));
  },

  async listChoices(questionId?: string): Promise<Choice[]> {
    const rows = await prisma.choice.findMany({
      where: questionId ? { questionId } : undefined,
      orderBy: [{ questionId: "asc" }, { order: "asc" }],
      select: {
        id: true,
        questionId: true,
        order: true,
        label: true,
        correct: true,
        // Choice モデルにも createdAt / updatedAt がないため仮置き
      },
    });
    const now = new Date().toISOString();
    return rows.map((r) => ({
      id: r.id,
      questionId: r.questionId,
      order: r.order,
      text: r.label,
      isCorrect: r.correct,
      // Prisma スキーマ上 Choice に日時カラムがないため実行時刻を入れる
      createdAt: now,
      updatedAt: now,
    }));
  },
};

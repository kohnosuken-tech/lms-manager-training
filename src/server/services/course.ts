import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { AppError } from "@/lib/errors";
import type { CmsPort } from "@/server/ports/cms";

// ---------- write 系ガード ----------

function assertWriteAllowed(): void {
  if (process.env.CMS_SOURCE === "spreadsheet") {
    throw new AppError(
      "WRITE_NOT_SUPPORTED",
      "Spreadsheet モードでは管理画面から教材を編集できません。Spreadsheet で直接編集してください。",
      422,
    );
  }
}

// ---------- Course write ----------

export type CreateCourseInput = {
  title: string;
  description: string;
  order: number;
};

export async function createCourse(
  actorId: string,
  input: CreateCourseInput,
): Promise<{ courseId: string }> {
  assertWriteAllowed();
  if (input.title.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "タイトルを入力してください。", 422);
  }
  const course = await prisma.course.create({
    data: {
      title: input.title.trim(),
      description: input.description.trim(),
      order: input.order,
    },
    select: { id: true },
  });
  await container.audit.write({
    actorId,
    action: "COURSE_CREATE",
    target: `Course:${course.id}`,
    diff: input,
  });
  return { courseId: course.id };
}

export type UpdateCourseInput = {
  id: string;
  title?: string;
  description?: string;
  order?: number;
};

export async function updateCourse(
  actorId: string,
  input: UpdateCourseInput,
): Promise<void> {
  assertWriteAllowed();
  const before = await prisma.course.findUnique({
    where: { id: input.id },
    select: { id: true, title: true, description: true, order: true },
  });
  if (!before) {
    throw new AppError("NOT_FOUND", "コースが見つかりません。", 404);
  }
  await prisma.course.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
  });
  await container.audit.write({
    actorId,
    action: "COURSE_UPDATE",
    target: `Course:${input.id}`,
    diff: { before, after: input },
  });
}

export async function publishCourse(
  actorId: string,
  id: string,
  published: boolean,
): Promise<void> {
  assertWriteAllowed();
  const before = await prisma.course.findUnique({
    where: { id },
    select: { id: true, published: true },
  });
  if (!before) {
    throw new AppError("NOT_FOUND", "コースが見つかりません。", 404);
  }
  await prisma.course.update({ where: { id }, data: { published } });
  await container.audit.write({
    actorId,
    action: "COURSE_PUBLISH",
    target: `Course:${id}`,
    diff: { from: before.published, to: published },
  });
}

// ---------- Lesson write ----------

export type CreateLessonInput = {
  courseId: string;
  title: string;
  videoUrl?: string;
  durationSec: number;
  order: number;
  blockSeek?: boolean;
  requiredCompletionRate?: number | null;
  description?: string;
};

export async function createLesson(
  actorId: string,
  input: CreateLessonInput,
): Promise<{ lessonId: string }> {
  assertWriteAllowed();
  if (input.title.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "タイトルを入力してください。", 422);
  }
  if (input.durationSec < 0) {
    throw new AppError("VALIDATION_FAILED", "再生時間は 0 以上で指定してください。", 422);
  }
  // write 系は Prisma で Course 存在確認 (spreadsheet モードはガードで弾かれる)
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: { id: true },
  });
  if (!course) {
    throw new AppError("NOT_FOUND", "コースが見つかりません。", 404);
  }
  const lesson = await prisma.lesson.create({
    data: {
      courseId: input.courseId,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      videoUrl: input.videoUrl ?? "/sample.mp4",
      durationSec: input.durationSec,
      order: input.order,
      blockSeek: input.blockSeek ?? false,
      requiredCompletionRate: input.requiredCompletionRate ?? null,
    },
    select: { id: true },
  });
  await container.audit.write({
    actorId,
    action: "LESSON_CREATE",
    target: `Lesson:${lesson.id}`,
    diff: input,
  });
  return { lessonId: lesson.id };
}

export type UpdateLessonInput = {
  id: string;
  courseId: string; // H-5: 呼び出し元が所属コースを明示的に指定する
  title?: string;
  description?: string;
  videoUrl?: string;
  durationSec?: number;
  order?: number;
  blockSeek?: boolean;
  requiredCompletionRate?: number | null;
};

export async function updateLesson(
  actorId: string,
  input: UpdateLessonInput,
): Promise<void> {
  assertWriteAllowed();
  const before = await prisma.lesson.findUnique({
    where: { id: input.id },
  });
  if (!before) {
    throw new AppError("NOT_FOUND", "レッスンが見つかりません。", 404);
  }
  // H-5: lesson が指定された courseId に属することを検証
  if (before.courseId !== input.courseId) {
    throw new AppError(
      "NOT_FOUND",
      "レッスンが見つかりません。",
      404,
    );
  }
  await prisma.lesson.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
      ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl } : {}),
      ...(input.durationSec !== undefined
        ? { durationSec: input.durationSec }
        : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.blockSeek !== undefined ? { blockSeek: input.blockSeek } : {}),
      ...(input.requiredCompletionRate !== undefined
        ? { requiredCompletionRate: input.requiredCompletionRate }
        : {}),
    },
  });
  await container.audit.write({
    actorId,
    action: "LESSON_UPDATE",
    target: `Lesson:${input.id}`,
    diff: { before, after: input },
  });
}

export type DeleteLessonInput = {
  id: string;
  courseId: string; // H-5: 呼び出し元が所属コースを明示的に指定する
};

export async function deleteLesson(
  actorId: string,
  input: DeleteLessonInput,
): Promise<void> {
  assertWriteAllowed();
  const before = await prisma.lesson.findUnique({
    where: { id: input.id },
    select: { id: true, courseId: true, title: true },
  });
  if (!before) {
    throw new AppError("NOT_FOUND", "レッスンが見つかりません。", 404);
  }
  // H-5: lesson が指定された courseId に属することを検証
  if (before.courseId !== input.courseId) {
    throw new AppError(
      "NOT_FOUND",
      "レッスンが見つかりません。",
      404,
    );
  }
  await prisma.lesson.delete({ where: { id: input.id } });
  await container.audit.write({
    actorId,
    action: "LESSON_DELETE",
    target: `Lesson:${input.id}`,
    diff: before,
  });
}

// ---------- Enrollment ----------

export async function assignCourse(
  actorId: string,
  input: { userIds: string[]; courseId: string; dueAt?: Date | null },
  cms: CmsPort = container.cms,
): Promise<{ assigned: number }> {
  // Course の存在確認は CmsPort 経由 (Spreadsheet モードでも Course が見える)
  const course = await cms.getCourse(input.courseId);
  if (!course) {
    throw new AppError("NOT_FOUND", "コースが見つかりません。", 404);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: input.userIds }, deactivated: false },
    select: { id: true, email: true, name: true },
  });
  if (users.length === 0) {
    return { assigned: 0 };
  }

  let assigned = 0;
  for (const u of users) {
    try {
      await prisma.enrollment.create({
        data: {
          userId: u.id,
          courseId: input.courseId,
          dueAt: input.dueAt ?? null,
        },
      });
      assigned++;
      // H-4: ENROLLMENT_CREATE の diff も userId / courseId のみ (PII 除外)
      await container.audit.write({
        actorId,
        action: "ENROLLMENT_CREATE",
        target: `Enrollment:${u.id}:${input.courseId}`,
        diff: { userId: u.id, courseId: input.courseId, dueAt: input.dueAt ?? null },
      });
      await container.mail.send(
        u.email,
        `[LMS] 「${course.title}」が割り当てられました`,
        `${u.name} さん、研修コース「${course.title}」が割り当てられました。${
          input.dueAt
            ? `期限: ${input.dueAt.toISOString().slice(0, 10)} まで`
            : "期限の指定はありません。"
        }`,
      );
    } catch {
      // P2002 (既割当) は黙ってスキップ
    }
  }
  return { assigned };
}

export async function unassignCourse(
  actorId: string,
  userId: string,
  courseId: string,
): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (!enrollment) return;
  await prisma.enrollment.delete({
    where: { userId_courseId: { userId, courseId } },
  });
  await container.audit.write({
    actorId,
    action: "ENROLLMENT_DELETE",
    target: `Enrollment:${userId}:${courseId}`,
  });
}

// ---------- クエリ (read 系 — CmsPort 経由) ----------

export type ListCoursesInput = {
  /** title 部分一致 */
  q?: string;
  published?: boolean;
};

export type CourseListItem = {
  id: string;
  title: string;
  description: string;
  order: number;
  published: boolean;
  createdAt: Date;
  _count: { lessons: number; enrollments: number };
};

/**
 * コース一覧を返す。
 * Course / Lesson の存在情報は CmsPort 経由で取得し、
 * 受講者数 (Enrollment) は Prisma から補完する。
 */
export async function listCourses(
  input: ListCoursesInput = {},
  cms: CmsPort = container.cms,
): Promise<CourseListItem[]> {
  // CmsPort から全コースを取得
  const cmsCourses = await cms.listCourses();

  // フィルタリング
  let filtered = cmsCourses;
  if (input.published !== undefined) {
    filtered = filtered.filter((c) => c.published === input.published);
  }
  if (input.q) {
    const q = input.q.toLowerCase();
    filtered = filtered.filter((c) => c.title.toLowerCase().includes(q));
  }

  if (filtered.length === 0) return [];

  // Lesson 数は CmsPort の listLessons で集計 (全件取得してクライアント側でカウント)
  const cmsLessons = await cms.listLessons();
  const lessonCountByCourse = new Map<string, number>();
  for (const l of cmsLessons) {
    lessonCountByCourse.set(l.courseId, (lessonCountByCourse.get(l.courseId) ?? 0) + 1);
  }

  // Enrollment 数は Prisma から集計 (User/Enrollment は SQL に残るため)
  const courseIds = filtered.map((c) => c.id);
  const enrollmentCounts = await prisma.enrollment.groupBy({
    by: ["courseId"],
    where: { courseId: { in: courseIds } },
    _count: { courseId: true },
  });
  const enrollmentCountByCourse = new Map(
    enrollmentCounts.map((e) => [e.courseId, e._count.courseId]),
  );

  // order → createdAt の順でソート (CmsPort 側で既に order ソート済みだがここでも保証)
  filtered.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return filtered.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    order: c.order,
    published: c.published,
    createdAt: new Date(c.createdAt),
    _count: {
      lessons: lessonCountByCourse.get(c.id) ?? 0,
      enrollments: enrollmentCountByCourse.get(c.id) ?? 0,
    },
  }));
}

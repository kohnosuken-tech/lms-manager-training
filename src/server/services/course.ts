import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { AppError } from "@/lib/errors";
import type { CmsPort } from "@/server/ports/cms";

// ---------- write 系ガード ----------

/**
 * Phase E 以降、Course / Lesson は CmsPort (TSV fixture or Spreadsheet) が唯一の
 * データソースとなるため、write 操作は常に不可。
 */
function assertWriteAllowed(): void {
  throw new AppError(
    "WRITE_NOT_SUPPORTED",
    "教材の編集は管理画面から行えません。TSV fixture または Spreadsheet で直接編集してください。",
    422,
  );
}

// ---------- Course write (ガードのみ残す) ----------

export type CreateCourseInput = {
  title: string;
  description: string;
  order: number;
};

export async function createCourse(
  _actorId: string,
  _input: CreateCourseInput,
): Promise<{ courseId: string }> {
  assertWriteAllowed();
  // unreachable — assertWriteAllowed は常に throw する
  return { courseId: "" };
}

export type UpdateCourseInput = {
  id: string;
  title?: string;
  description?: string;
  order?: number;
};

export async function updateCourse(
  _actorId: string,
  _input: UpdateCourseInput,
): Promise<void> {
  assertWriteAllowed();
}

export async function publishCourse(
  _actorId: string,
  _id: string,
  _published: boolean,
): Promise<void> {
  assertWriteAllowed();
}

// ---------- Lesson write (ガードのみ残す) ----------

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
  _actorId: string,
  _input: CreateLessonInput,
): Promise<{ lessonId: string }> {
  assertWriteAllowed();
  return { lessonId: "" };
}

export type UpdateLessonInput = {
  id: string;
  courseId: string;
  title?: string;
  description?: string;
  videoUrl?: string;
  durationSec?: number;
  order?: number;
  blockSeek?: boolean;
  requiredCompletionRate?: number | null;
};

export async function updateLesson(
  _actorId: string,
  _input: UpdateLessonInput,
): Promise<void> {
  assertWriteAllowed();
}

export type DeleteLessonInput = {
  id: string;
  courseId: string;
};

export async function deleteLesson(
  _actorId: string,
  _input: DeleteLessonInput,
): Promise<void> {
  assertWriteAllowed();
}

// ---------- Enrollment ----------

export async function assignCourse(
  actorId: string,
  input: { userIds: string[]; courseId: string; dueAt?: Date | null },
  cms: CmsPort = container.cms,
): Promise<{ assigned: number }> {
  // Course の存在確認は CmsPort 経由 (Spreadsheet / local どちらでも Course が見える)
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

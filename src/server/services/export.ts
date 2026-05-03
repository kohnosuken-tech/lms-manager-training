/**
 * CSV エクスポート用 pure function 群
 *
 * 各関数は Prisma クエリを実行して行データを生成し、CSV 文字列を返す。
 * Course / Lesson の名前解決は CmsPort 経由で行う。
 * UTF-8 BOM は呼び出し元 (Route Handler) で付与する。
 */

import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import type { CmsPort } from "@/server/ports/cms";

// ---------- 共通ヘルパー ----------

/** CSV セルをクォート (ダブルクォート内のダブルクォートはエスケープ)
 *
 * CSV インジェクション対策: 値の先頭が数式トリガー文字 (=, +, -, @, TAB, CR) の場合は
 * シングルクォートをプレフィクスとして付加してからクォート処理する。
 */
function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // CSV インジェクション対策
  if (str.length > 0 && /^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  // カンマ、改行、ダブルクォートを含む場合はダブルクォートで囲む
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function toIsoDateOrEmpty(d: Date | null | undefined): string {
  return d ? d.toISOString() : "";
}

// ---------- users CSV ----------

export type UserCsvRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  deactivated: boolean;
  createdAt: Date;
};

export async function buildUsersCsv(): Promise<string> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      deactivated: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const header = csvRow(["id", "email", "name", "role", "deactivated", "createdAt"]);
  const rows = users.map((u) =>
    csvRow([u.id, u.email, u.name, u.role, u.deactivated, toIsoDateOrEmpty(u.createdAt)]),
  );
  return [header, ...rows].join("\r\n");
}

// ---------- courses CSV ----------

/**
 * コース一覧 CSV を生成する。
 * Course 情報は CmsPort 経由で取得し、Lesson 数も CmsPort から集計する。
 */
export async function buildCoursesCsv(
  cms: CmsPort = container.cms,
): Promise<string> {
  const [cmsCourses, cmsLessons] = await Promise.all([
    cms.listCourses(),
    cms.listLessons(),
  ]);

  // Lesson 数をコースごとに集計
  const lessonCountByCourse = new Map<string, number>();
  for (const l of cmsLessons) {
    lessonCountByCourse.set(l.courseId, (lessonCountByCourse.get(l.courseId) ?? 0) + 1);
  }

  const header = csvRow([
    "id",
    "title",
    "description",
    "published",
    "lessonCount",
    "createdAt",
  ]);
  const rows = cmsCourses.map((c) =>
    csvRow([
      c.id,
      c.title,
      c.description,
      c.published,
      lessonCountByCourse.get(c.id) ?? 0,
      c.createdAt,
    ]),
  );
  return [header, ...rows].join("\r\n");
}

// ---------- progress CSV ----------

/**
 * 進捗 CSV を生成する。
 * Progress は Prisma から取得し、Course / Lesson 名は CmsPort 経由で解決する。
 */
export async function buildProgressCsv(
  courseId?: string,
  cms: CmsPort = container.cms,
): Promise<string> {
  // CmsPort から Lesson 一覧を取得してルックアップマップを構築
  const [cmsLessons, cmsCourses] = await Promise.all([
    cms.listLessons(courseId),
    cms.listCourses(),
  ]);

  const lessonMap = new Map(cmsLessons.map((l) => [l.id, l]));
  const courseMap = new Map(cmsCourses.map((c) => [c.id, c]));

  // Progress を Prisma から取得
  // courseId が指定された場合は対象 Lesson の ID でフィルタ
  const lessonIds = courseId ? cmsLessons.map((l) => l.id) : undefined;

  const progressList = await prisma.progress.findMany({
    where: lessonIds !== undefined
      ? { lessonId: { in: lessonIds } }
      : undefined,
    select: {
      lessonId: true,
      watchedSec: true,
      completed: true,
      completedAt: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: [
      { user: { email: "asc" } },
    ],
  });

  const header = csvRow([
    "userEmail",
    "userName",
    "courseTitle",
    "lessonTitle",
    "watchedSec",
    "completed",
    "completedAt",
  ]);

  const rows = progressList.map((p) => {
    const lesson = lessonMap.get(p.lessonId);
    const course = lesson ? courseMap.get(lesson.courseId) : undefined;
    return csvRow([
      p.user.email,
      p.user.name,
      course?.title ?? "",
      lesson?.title ?? "",
      p.watchedSec,
      p.completed,
      toIsoDateOrEmpty(p.completedAt),
    ]);
  });

  return [header, ...rows].join("\r\n");
}

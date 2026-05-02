/**
 * CSV エクスポート用 pure function 群
 *
 * 各関数は Prisma クエリを実行して行データを生成し、CSV 文字列を返す。
 * UTF-8 BOM は呼び出し元 (Route Handler) で付与する。
 */

import { prisma } from "@/server/repositories/db";

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

export async function buildCoursesCsv(): Promise<string> {
  const courses = await prisma.course.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      published: true,
      createdAt: true,
      _count: { select: { lessons: true } },
    },
    orderBy: { order: "asc" },
  });

  const header = csvRow([
    "id",
    "title",
    "description",
    "published",
    "lessonCount",
    "createdAt",
  ]);
  const rows = courses.map((c) =>
    csvRow([
      c.id,
      c.title,
      c.description,
      c.published,
      c._count.lessons,
      toIsoDateOrEmpty(c.createdAt),
    ]),
  );
  return [header, ...rows].join("\r\n");
}

// ---------- progress CSV ----------

export async function buildProgressCsv(courseId?: string): Promise<string> {
  // コース指定がある場合はそのコースのみ、なければ全コース
  const progressList = await prisma.progress.findMany({
    where: courseId
      ? { lesson: { courseId } }
      : undefined,
    select: {
      watchedSec: true,
      completed: true,
      completedAt: true,
      user: { select: { email: true, name: true } },
      lesson: {
        select: {
          title: true,
          course: { select: { title: true } },
        },
      },
    },
    orderBy: [
      { user: { email: "asc" } },
      { lesson: { course: { title: "asc" } } },
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
  const rows = progressList.map((p) =>
    csvRow([
      p.user.email,
      p.user.name,
      p.lesson.course.title,
      p.lesson.title,
      p.watchedSec,
      p.completed,
      toIsoDateOrEmpty(p.completedAt),
    ]),
  );
  return [header, ...rows].join("\r\n");
}

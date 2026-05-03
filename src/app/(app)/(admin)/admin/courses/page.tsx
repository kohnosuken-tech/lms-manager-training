import Link from "next/link";
import { BookOpen, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { CreateCourseForm } from "./create-course-form";
import { CoursesFilterBar } from "./courses-filter-bar";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "コース管理 | LMS" };

type SearchParams = Promise<{
  q?: string;
  published?: string;
}>;

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const publishedParam = params.published; // "true" | "false" | undefined

  // SQLite (dev) では mode: "insensitive" が使えないため contains のみ使用。
  // 本番 (Neon Postgres) 切替後は mode: "insensitive" に変更可能。
  const where: Prisma.CourseWhereInput = {
    ...(q ? { title: { contains: q } } : {}),
    ...(publishedParam === "true"
      ? { published: true }
      : publishedParam === "false"
        ? { published: false }
        : {}),
  };

  const courses = await prisma.course.findMany({
    where,
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      published: true,
      order: true,
      _count: { select: { lessons: true, enrollments: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">コース / 教材管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          コースを作成し、各コース詳細でレッスン・受講割当を編集します。
        </p>
      </div>

      <CreateCourseForm />

      {/* 検索 / フィルタ */}
      <CoursesFilterBar currentQ={q} currentPublished={publishedParam} />

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12 font-semibold">順</TableHead>
              <TableHead className="font-semibold">タイトル</TableHead>
              <TableHead className="font-semibold">レッスン数</TableHead>
              <TableHead className="font-semibold">受講者数</TableHead>
              <TableHead className="font-semibold">公開状態</TableHead>
              <TableHead className="text-right font-semibold">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <BookOpen className="size-10 text-muted-foreground/30" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      {q || publishedParam
                        ? "検索条件に一致するコースがありません。"
                        : "コースがまだありません。上のフォームから作成してください。"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              courses.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-muted-foreground tabular-nums">{c.order}</TableCell>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>{c._count.lessons}</TableCell>
                  <TableCell>{c._count.enrollments}</TableCell>
                  <TableCell>
                    {c.published ? (
                      <Badge>公開中</Badge>
                    ) : (
                      <Badge variant="secondary">下書き</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="icon-xs" variant="ghost" aria-label={`${c.title} を編集`}>
                      <Link href={`/admin/courses/${c.id}`}>
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

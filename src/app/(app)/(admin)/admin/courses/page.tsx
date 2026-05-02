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

export const metadata = { title: "コース管理 | LMS" };

export default async function AdminCoursesPage() {
  await requireAdmin();
  const courses = await prisma.course.findMany({
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
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
                      コースがまだありません。上のフォームから作成してください。
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

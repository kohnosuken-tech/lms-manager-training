import Link from "next/link";
import { FileQuestion, Pencil, AlertCircle } from "lucide-react";
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
import { container } from "@/server/container";
import { CreateTestForm } from "./create-test-form";

export const metadata = { title: "テスト管理 | LMS" };

export default async function AdminTestsPage() {
  await requireAdmin();

  const [tests, courses, questions] = await Promise.all([
    container.cms.listTests(),
    container.cms.listCourses(),
    container.cms.listQuestions(),
  ]);

  // courseId -> courseTitle のマップ
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  // testId -> question 数のマップ
  const questionCountByTest = new Map<string, number>();
  for (const q of questions) {
    questionCountByTest.set(q.testId, (questionCountByTest.get(q.testId) ?? 0) + 1);
  }

  const sortedCourses = [...courses].sort((a, b) => a.order - b.order);
  const sortedTests = [...tests].sort((a, b) => {
    const cmp = a.courseId.localeCompare(b.courseId);
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">テスト管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          コースごとに確認テストを作成し、設問を編集します。
        </p>
      </div>

      {sortedCourses.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <AlertCircle className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">先にコースを作成してください。</p>
        </div>
      ) : (
        <CreateTestForm courses={sortedCourses.map((c) => ({ id: c.id, title: c.title }))} />
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">テスト名</TableHead>
              <TableHead className="font-semibold">コース</TableHead>
              <TableHead className="font-semibold">問題数</TableHead>
              <TableHead className="font-semibold">合格点</TableHead>
              <TableHead className="font-semibold">受験上限</TableHead>
              <TableHead className="font-semibold">状態</TableHead>
              <TableHead className="text-right font-semibold">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <FileQuestion className="size-10 text-muted-foreground/30" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">まだテストがありません。</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedTests.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {courseMap.get(t.courseId)?.title ?? t.courseId}
                  </TableCell>
                  <TableCell>{questionCountByTest.get(t.id) ?? 0}</TableCell>
                  <TableCell>{t.passingScore != null ? `${t.passingScore}%` : "-"}</TableCell>
                  <TableCell>{t.maxAttempts ?? "-"}</TableCell>
                  <TableCell>
                    {t.published ? (
                      <Badge>公開中</Badge>
                    ) : (
                      <Badge variant="secondary">下書き</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="icon-xs" variant="ghost" aria-label={`${t.title} を編集`}>
                      <Link href={`/admin/tests/${t.id}`}>
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

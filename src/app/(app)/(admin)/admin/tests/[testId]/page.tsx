import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import { TestMetaForm } from "./test-meta-form";
import { QuestionsSection } from "./questions-section";

export const metadata = { title: "テスト編集 | LMS" };

export default async function AdminTestEditPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  await requireAdmin();
  const { testId } = await params;

  const [test, courses] = await Promise.all([
    prisma.test.findUnique({
      where: { id: testId },
      include: {
        course: { select: { id: true, title: true } },
        questions: {
          orderBy: { order: "asc" },
          include: {
            choices: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    prisma.course.findMany({
      orderBy: { order: "asc" },
      select: { id: true, title: true },
    }),
  ]);
  if (!test) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{test.title}</h1>
          <p className="text-sm text-muted-foreground">
            コース: <Badge variant="outline">{test.course.title}</Badge>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/tests">← 一覧へ戻る</Link>
        </Button>
      </div>

      <TestMetaForm
        test={{
          id: test.id,
          title: test.title,
          description: test.description,
          passingScore: test.passingScore,
          maxAttempts: test.maxAttempts,
          timeLimitSec: test.timeLimitSec,
          prerequisiteCourseId: test.prerequisiteCourseId,
          published: test.published,
        }}
        courses={courses}
      />

      <QuestionsSection
        testId={test.id}
        questions={test.questions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          explanation: q.explanation,
          order: q.order,
          choices: q.choices.map((c) => ({
            id: c.id,
            label: c.label,
            correct: c.correct,
          })),
        }))}
      />
    </div>
  );
}

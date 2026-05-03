import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/auth";
import { container } from "@/server/container";
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

  const [test, courses, questions, allChoices] = await Promise.all([
    container.cms.getTest(testId),
    container.cms.listCourses(),
    container.cms.listQuestions(testId),
    container.cms.listChoices(),
  ]);
  if (!test) notFound();

  const course = await container.cms.getCourse(test.courseId);

  // questionId -> choices のマップを構築
  const choicesByQuestion = new Map<string, typeof allChoices>();
  for (const c of allChoices) {
    const arr = choicesByQuestion.get(c.questionId) ?? [];
    arr.push(c);
    choicesByQuestion.set(c.questionId, arr);
  }

  const sortedCourses = [...courses].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{test.title}</h1>
          <p className="text-sm text-muted-foreground">
            コース: <Badge variant="outline">{course?.title ?? test.courseId}</Badge>
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
          description: "",
          passingScore: test.passingScore ?? 70,
          maxAttempts: test.maxAttempts ?? 3,
          timeLimitSec: null,
          prerequisiteCourseId: null,
          published: test.published,
        }}
        courses={sortedCourses.map((c) => ({ id: c.id, title: c.title }))}
      />

      <QuestionsSection
        testId={test.id}
        questions={questions
          .sort((a, b) => a.order - b.order)
          .map((q) => ({
            id: q.id,
            type: q.type,
            prompt: q.text,
            explanation: "",
            order: q.order,
            choices: (choicesByQuestion.get(q.id) ?? [])
              .sort((a, b) => a.order - b.order)
              .map((c) => ({
                id: c.id,
                label: c.text,
                correct: c.isCorrect,
              })),
          }))}
      />
    </div>
  );
}

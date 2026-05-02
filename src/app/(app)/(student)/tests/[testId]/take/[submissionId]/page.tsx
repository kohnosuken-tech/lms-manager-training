import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/repositories/db";
import {
  TestTaker,
  type TestTakerQuestion,
} from "@/components/feature/TestTaker";

type Params = { testId: string; submissionId: string };

/**
 * Submission ID をシードに決定論的にシャッフルする (Fisher-Yates)。
 * 同じ submissionId なら何度開いても同じ順になる。
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  // 文字列を 32bit ハッシュへ
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mulberry32 PRNG
  let s = h >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default async function TakeTestPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { testId, submissionId } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      test: {
        select: {
          id: true,
          title: true,
          shuffleQuestions: true,
          shuffleChoices: true,
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              type: true,
              prompt: true,
              order: true,
              choices: {
                orderBy: { order: "asc" },
                select: { id: true, label: true, order: true },
              },
            },
          },
        },
      },
    },
  });
  if (!submission) notFound();
  if (submission.testId !== testId) notFound();
  if (submission.userId !== user.id && user.role !== "ADMIN") {
    redirect("/forbidden");
  }
  if (submission.status !== "IN_PROGRESS") {
    redirect(`/submissions/${submission.id}`);
  }

  let questions = submission.test.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices.map((c) => ({ id: c.id, label: c.label })),
  }));

  if (submission.test.shuffleQuestions) {
    questions = seededShuffle(questions, `${submissionId}:q`);
  }
  if (submission.test.shuffleChoices) {
    questions = questions.map((q) => ({
      ...q,
      choices: seededShuffle(q.choices, `${submissionId}:${q.id}`),
    }));
  }

  const renderQuestions: TestTakerQuestion[] = questions;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/tests/${testId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← テスト概要に戻る
        </Link>
        <h1 className="text-2xl font-semibold">{submission.test.title}</h1>
        <p className="text-sm text-muted-foreground">
          全 {questions.length} 問。提出後に解説が表示されます。
        </p>
      </div>

      <TestTaker
        submissionId={submission.id}
        testId={testId}
        questions={renderQuestions}
      />
    </div>
  );
}

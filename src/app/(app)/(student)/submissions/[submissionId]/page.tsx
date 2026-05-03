import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { getSubmissionForResult } from "@/server/services/test";
import { startTestAction } from "@/app/(app)/(student)/tests/[testId]/actions";
import { AppError } from "@/lib/errors";

type Params = { submissionId: string };

export default async function SubmissionResultPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { submissionId } = await params;

  let data;
  try {
    data = await getSubmissionForResult(submissionId, user.id, user.role);
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "NOT_FOUND") notFound();
      if (e.code === "FORBIDDEN") redirect("/forbidden");
    }
    throw e;
  }
  const { submission, remainingAttempts } = data;

  if (submission.status === "IN_PROGRESS") {
    // 未提出なら受験画面に戻す
    redirect(`/tests/${submission.testId}/take/${submission.id}`);
  }

  // 自分の選択を questionId -> Set<choiceId> にマップ
  const myAnswers = new Map<string, Set<string>>();
  for (const a of submission.answers) {
    const set = myAnswers.get(a.questionId) ?? new Set<string>();
    set.add(a.choiceId);
    myAnswers.set(a.questionId, set);
  }

  const test = submission.test;
  const passed = submission.status === "PASSED";
  const canRetry =
    !passed && remainingAttempts > 0 && submission.status === "FAILED";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/courses/${test.courseId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {test.courseTitle}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{test.title} の結果</h1>
          {passed ? (
            <Badge>合格</Badge>
          ) : (
            <Badge variant="destructive">不合格</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {submission.score ?? 0} 点 / 100 点
          </CardTitle>
          <CardDescription>
            合格基準 {test.passingScore}% / 試行 {submission.attemptNo} 回目 /
            残り受験回数 {remainingAttempts}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {canRetry ? (
            <form action={startTestAction}>
              <input type="hidden" name="testId" value={test.id} />
              <Button type="submit">再受験する</Button>
            </form>
          ) : null}
          {passed ? (
            <Button variant="outline" asChild>
              <Link href={`/courses/${test.courseId}`}>コースに戻る</Link>
            </Button>
          ) : null}
          {!passed && remainingAttempts === 0 ? (
            <Button variant="outline" disabled>
              受験回数の上限に達しました
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">設問の解説</h2>
        {test.questions.map((q, idx) => {
          const correctIds = new Set(
            q.choices.filter((c) => c.correct).map((c) => c.id),
          );
          const chosenIds = myAnswers.get(q.id) ?? new Set<string>();
          let isCorrect = correctIds.size === chosenIds.size && correctIds.size > 0;
          if (isCorrect) {
            for (const cid of chosenIds) {
              if (!correctIds.has(cid)) {
                isCorrect = false;
                break;
              }
            }
          }
          return (
            <Card key={q.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    問 {idx + 1}. {q.prompt}
                  </CardTitle>
                  {isCorrect ? (
                    <Badge>正解</Badge>
                  ) : (
                    <Badge variant="destructive">不正解</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <ul className="space-y-1">
                  {q.choices.map((c) => {
                    const chosen = chosenIds.has(c.id);
                    const correct = c.correct;
                    return (
                      <li
                        key={c.id}
                        className={
                          "flex items-start gap-2 rounded-md border bg-background px-3 py-2 " +
                          (correct
                            ? "border-primary/40 bg-primary/5"
                            : chosen && !correct
                              ? "border-destructive/40 bg-destructive/5"
                              : "")
                        }
                      >
                        <span className="text-xs tabular-nums">
                          {chosen ? "選択" : "　　"}
                        </span>
                        <span className="flex-1">{c.label}</span>
                        {correct ? (
                          <Badge variant="default">正答</Badge>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {q.explanation ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                    解説: {q.explanation}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

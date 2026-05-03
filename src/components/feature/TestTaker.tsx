"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { submitTestAction } from "@/app/(app)/(student)/tests/[testId]/actions";

export type TestTakerQuestion = {
  id: string;
  type: "SINGLE" | "MULTIPLE";
  prompt: string;
  choices: { id: string; label: string }[];
};

export type TestTakerProps = {
  submissionId: string;
  testId: string;
  questions: TestTakerQuestion[];
};

export function TestTaker({ submissionId, testId, questions }: TestTakerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Set<string>>>({});

  const totalQuestions = questions.length;
  const answeredCount = useMemo(
    () =>
      questions.filter((q) => (answers[q.id]?.size ?? 0) > 0).length,
    [questions, answers],
  );

  function setSingle(qId: string, choiceId: string) {
    setAnswers((prev) => ({ ...prev, [qId]: new Set([choiceId]) }));
  }

  function toggleMultiple(qId: string, choiceId: string) {
    setAnswers((prev) => {
      const next = new Set(prev[qId] ?? []);
      if (next.has(choiceId)) next.delete(choiceId);
      else next.add(choiceId);
      return { ...prev, [qId]: next };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    // M-4: testId を渡してサービス層で Submission との整合を検証する
    const payload = {
      testId,
      submissionId,
      answers: questions.map((q) => ({
        questionId: q.id,
        choiceIds: Array.from(answers[q.id] ?? []),
      })),
    };
    startTransition(async () => {
      const res = await submitTestAction(payload);
      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }
      router.push(`/submissions/${submissionId}`);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="text-xs text-muted-foreground">
        回答済み {answeredCount} / {totalQuestions}
      </div>

      {questions.map((q, idx) => (
        <Card key={q.id}>
          <CardHeader>
            <CardTitle className="text-base">
              問 {idx + 1}. {q.prompt}
            </CardTitle>
            <CardDescription>
              {q.type === "SINGLE"
                ? "1 つだけ選択してください"
                : "当てはまるものをすべて選択してください"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.choices.map((c) => {
              const checked = answers[q.id]?.has(c.id) ?? false;
              const inputId = `q-${q.id}-c-${c.id}`;
              return (
                <label
                  key={c.id}
                  htmlFor={inputId}
                  className="flex cursor-pointer items-start gap-3 rounded-md border bg-background px-3 py-2 hover:bg-accent/30"
                >
                  <input
                    id={inputId}
                    type={q.type === "SINGLE" ? "radio" : "checkbox"}
                    name={`q-${q.id}`}
                    checked={checked}
                    onChange={() => {
                      if (q.type === "SINGLE") setSingle(q.id, c.id);
                      else toggleMultiple(q.id, c.id);
                    }}
                    className="mt-1"
                    disabled={isPending}
                  />
                  <span className="text-sm">{c.label}</span>
                </label>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending || answeredCount < totalQuestions}
        >
          {isPending ? "提出中..." : "提出する"}
        </Button>
        <span className="text-xs text-muted-foreground">
          すべての設問に回答すると提出できます。
        </span>
        <span className="hidden text-xs text-muted-foreground">{testId}</span>
      </div>
    </form>
  );
}

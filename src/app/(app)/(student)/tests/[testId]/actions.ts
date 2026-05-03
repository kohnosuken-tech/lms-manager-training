"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  startSubmission,
  submitSubmission,
  type SubmitAnswer,
} from "@/server/services/test";
import { AppError } from "@/lib/errors";
import { ok, err, type ApiResult } from "@/lib/result";

const StartSchema = z.object({ testId: z.string().min(1) });

const SubmitSchema = z.object({
  // M-4: testId を追加して Submission と Route の testId 整合を検証する
  testId: z.string().min(1),
  submissionId: z.string().min(1),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      choiceIds: z.array(z.string().min(1)),
    }),
  ),
});

/**
 * テスト受験を開始 → take ページへ redirect する Server Action。
 * フォーム or ボタン onClick から呼ばれる想定。
 */
export async function startTestAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = StartSchema.safeParse({
    testId: String(formData.get("testId") ?? ""),
  });
  if (!parsed.success) {
    redirect("/dashboard");
  }
  const testId = parsed.data.testId;

  let submissionId: string;
  try {
    const r = await startSubmission(user.id, testId);
    submissionId = r.submissionId;
  } catch (e) {
    if (e instanceof AppError) {
      // エラー種別に応じて redirect 先を変える
      if (e.code === "ATTEMPTS_EXCEEDED") {
        redirect(`/tests/${testId}?error=ATTEMPTS_EXCEEDED`);
      }
      if (e.code === "PREREQUISITE_NOT_MET") {
        redirect(`/tests/${testId}?error=PREREQUISITE_NOT_MET`);
      }
      if (e.code === "FORBIDDEN") {
        redirect("/forbidden");
      }
      if (e.code === "CONFLICT") {
        redirect(`/tests/${testId}?error=CONFLICT`);
      }
    }
    throw e;
  }

  redirect(`/tests/${testId}/take/${submissionId}`);
}

export type SubmitTestResult = ApiResult<{
  score: number;
  status: "PASSED" | "FAILED";
}>;

/**
 * M-4: testId も受け取り、submitSubmission の expectedTestId に渡す。
 * Submission が意図した Test に属しているかをサービス層で検証する。
 */
export async function submitTestAction(input: {
  testId: string;
  submissionId: string;
  answers: SubmitAnswer[];
}): Promise<SubmitTestResult> {
  const user = await requireUser();
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) {
    return err("VALIDATION_FAILED", "入力値が不正です。");
  }

  try {
    const r = await submitSubmission(
      parsed.data.submissionId,
      user.id,
      parsed.data.answers,
      parsed.data.testId,
    );
    return ok({
      score: r.score,
      status: r.status as "PASSED" | "FAILED",
    });
  } catch (e) {
    if (e instanceof AppError) {
      return err(e.code, e.message);
    }
    return err("INTERNAL", "提出に失敗しました。");
  }
}

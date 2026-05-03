import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { AppError } from "@/lib/errors";
import type { Prisma, SubmissionStatus } from "@prisma/client";
import type { CmsPort } from "@/server/ports/cms";

export type StartSubmissionResult = {
  submissionId: string;
  resumed: boolean;
};

/**
 * テスト受験を開始する。
 *
 * - Test の存在確認と prerequisite チェックは CmsPort 経由
 * - Lesson の存在確認も CmsPort 経由 (listLessons)
 * - Enrollment / Progress / Submission は Prisma のまま
 */
export async function startSubmission(
  userId: string,
  testId: string,
  cms: CmsPort = container.cms,
): Promise<StartSubmissionResult> {
  // Test の取得は CmsPort 経由
  const cmsTest = await cms.getTest(testId);
  if (!cmsTest) {
    throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);
  }
  if (!cmsTest.published) {
    throw new AppError("NOT_FOUND", "テストが公開されていません。", 404);
  }

  const courseId = cmsTest.courseId;
  const maxAttempts = cmsTest.maxAttempts ?? 3;

  // 受講者がこの Course に Enrollment を持っているか
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });
  if (!enrollment) {
    throw new AppError(
      "FORBIDDEN",
      "このテストを受験する権限がありません。",
      403,
    );
  }

  // 当該 Course の全 Lesson を完了しているかチェック (Lesson 一覧は CmsPort 経由)
  const cmsLessons = await cms.listLessons(courseId);
  if (cmsLessons.length === 0) {
    throw new AppError(
      "PREREQUISITE_NOT_MET",
      "受講可能なレッスンがありません。",
      422,
    );
  }
  const lessonIds = cmsLessons.map((l) => l.id);
  const completedCount = await prisma.progress.count({
    where: {
      userId,
      lessonId: { in: lessonIds },
      completed: true,
    },
  });
  if (completedCount < cmsLessons.length) {
    throw new AppError(
      "PREREQUISITE_NOT_MET",
      "全レッスンを完了してから受験してください。",
      422,
    );
  }

  // IN_PROGRESS の Submission があれば再利用
  const inProgress = await prisma.submission.findFirst({
    where: { userId, testId, status: "IN_PROGRESS" },
    select: { id: true },
    orderBy: { startedAt: "desc" },
  });
  if (inProgress) {
    return { submissionId: inProgress.id, resumed: true };
  }

  // attempts チェック (確定済みの提出回数のみカウント)
  const finishedAttempts = await prisma.submission.count({
    where: {
      userId,
      testId,
      status: { in: ["PASSED", "FAILED", "SUBMITTED"] },
    },
  });

  // 既に合格済みなら再受験不要 (新規開始も不要)
  const passed = await prisma.submission.findFirst({
    where: { userId, testId, status: "PASSED" },
    select: { id: true },
  });
  if (passed) {
    throw new AppError(
      "CONFLICT",
      "既に合格済みのテストです。",
      409,
    );
  }

  if (finishedAttempts >= maxAttempts) {
    throw new AppError(
      "ATTEMPTS_EXCEEDED",
      "受験回数の上限に達しました。",
      422,
    );
  }

  const submission = await prisma.submission.create({
    data: {
      testId,
      userId,
      status: "IN_PROGRESS",
      attemptNo: finishedAttempts + 1,
    },
    select: { id: true },
  });

  container.logger.info("submission.start", {
    userId,
    testId,
    submissionId: submission.id,
    attemptNo: finishedAttempts + 1,
  });

  return { submissionId: submission.id, resumed: false };
}

export type SubmitAnswer = {
  questionId: string;
  choiceIds: string[];
};

export type SubmitSubmissionResult = {
  score: number;
  status: SubmissionStatus;
};

/**
 * 提出 + 自動採点。部分点なし: 問題ごとに「選んだ集合」と「isCorrect=true 集合」が
 * 完全一致のみ正解。
 *
 * M-4: testId を受け取り、Submission の testId と一致することを検証する。
 * 不一致の場合は NOT_FOUND を返す (IDOR / ID 混同攻撃を防ぐ)。
 *
 * 採点で使う Question / Choice は CmsPort 経由で取得する (Phase E 移行後)。
 */
export async function submitSubmission(
  submissionId: string,
  userId: string,
  answers: SubmitAnswer[],
  expectedTestId?: string,
  cms: CmsPort = container.cms,
): Promise<SubmitSubmissionResult> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      testId: true,
      userId: true,
      status: true,
      attemptNo: true,
    },
  });
  if (!submission) {
    throw new AppError("NOT_FOUND", "提出が見つかりません。", 404);
  }
  // M-4: testId 整合検証 — Submission が期待する Test に紐づいているか確認する
  if (expectedTestId !== undefined && submission.testId !== expectedTestId) {
    throw new AppError("NOT_FOUND", "提出が見つかりません。", 404);
  }
  if (submission.userId !== userId) {
    throw new AppError("FORBIDDEN", "他人の提出は操作できません。", 403);
  }
  if (submission.status !== "IN_PROGRESS") {
    throw new AppError(
      "CONFLICT",
      "この提出は既に確定済みです。",
      409,
    );
  }

  // Test のメタデータ (passingScore) は CmsPort 経由で取得
  const cmsTest = await cms.getTest(submission.testId);
  if (!cmsTest) {
    throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);
  }
  const passingScore = cmsTest.passingScore ?? 70;

  // Question / Choice は CmsPort 経由で取得
  const cmsQuestions = await cms.listQuestions(submission.testId);
  const totalQuestions = cmsQuestions.length;
  if (totalQuestions === 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      "問題が登録されていません。",
      422,
    );
  }

  // Choice をすべて取得してルックアップマップを構築
  const allChoices = await cms.listChoices();
  const choicesByQuestion = new Map<string, { id: string; isCorrect: boolean }[]>();
  for (const c of allChoices) {
    if (!choicesByQuestion.has(c.questionId)) {
      choicesByQuestion.set(c.questionId, []);
    }
    choicesByQuestion.get(c.questionId)!.push({ id: c.id, isCorrect: c.isCorrect });
  }

  const answerByQuestionId = new Map<string, Set<string>>();
  for (const a of answers) {
    answerByQuestionId.set(a.questionId, new Set(a.choiceIds));
  }

  let correctCount = 0;
  const answerRows: Prisma.AnswerCreateManyInput[] = [];

  for (const q of cmsQuestions) {
    const questionChoices = choicesByQuestion.get(q.id) ?? [];
    const correctSet = new Set(
      questionChoices.filter((c) => c.isCorrect).map((c) => c.id),
    );
    const chosen = answerByQuestionId.get(q.id) ?? new Set<string>();

    // 完全一致判定
    let isCorrect = correctSet.size === chosen.size && correctSet.size > 0;
    if (isCorrect) {
      for (const cid of chosen) {
        if (!correctSet.has(cid)) {
          isCorrect = false;
          break;
        }
      }
    }
    if (isCorrect) correctCount++;

    // 選択した choice を Answer 行として保存
    // 不正な choiceId (この問題に属さない) は捨てる
    const validChoiceIds = new Set(questionChoices.map((c) => c.id));
    for (const cid of chosen) {
      if (validChoiceIds.has(cid)) {
        answerRows.push({
          submissionId,
          questionId: q.id,
          choiceId: cid,
        });
      }
    }
  }

  const score = Math.round((correctCount / totalQuestions) * 100);
  const status: SubmissionStatus =
    score >= passingScore ? "PASSED" : "FAILED";

  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { submissionId } }),
    ...(answerRows.length > 0
      ? [prisma.answer.createMany({ data: answerRows })]
      : []),
    prisma.submission.update({
      where: { id: submissionId },
      data: {
        status,
        score,
        submittedAt: new Date(),
      },
    }),
  ]);

  await container.audit.write({
    actorId: userId,
    action: "SUBMISSION_GRADE",
    target: `Submission:${submissionId}`,
    diff: { score, status, attemptNo: submission.attemptNo },
  });

  container.logger.info("submission.graded", {
    userId,
    submissionId,
    score,
    status,
  });

  return { score, status };
}

export type SubmissionResultQuestion = {
  id: string;
  prompt: string;
  explanation: string;
  type: "SINGLE" | "MULTIPLE";
  order: number;
  choices: {
    id: string;
    label: string;
    correct: boolean;
    order: number;
  }[];
};

export type SubmissionResultTest = {
  id: string;
  title: string;
  passingScore: number;
  maxAttempts: number;
  courseId: string;
  courseTitle: string;
  questions: SubmissionResultQuestion[];
};

export type SubmissionForResult = {
  submission: {
    id: string;
    testId: string;
    userId: string;
    status: SubmissionStatus;
    score: number | null;
    attemptNo: number;
    startedAt: Date;
    submittedAt: Date | null;
    answers: { questionId: string; choiceId: string }[];
    test: SubmissionResultTest;
  };
  remainingAttempts: number;
};

/**
 * 結果ページ表示用: Submission + Question + Choice + Answer を取得する。
 * アクセス権 (本人 or ADMIN) は呼び出し側で渡された role と userId で検証する。
 * Question / Choice は CmsPort 経由で取得する (Phase E 移行後)。
 */
export async function getSubmissionForResult(
  submissionId: string,
  viewerUserId: string,
  viewerRole: "STUDENT" | "ADMIN",
  cms: CmsPort = container.cms,
): Promise<SubmissionForResult> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      testId: true,
      userId: true,
      status: true,
      score: true,
      attemptNo: true,
      startedAt: true,
      submittedAt: true,
      answers: {
        select: { questionId: true, choiceId: true },
      },
    },
  });
  if (!submission) {
    throw new AppError("NOT_FOUND", "提出が見つかりません。", 404);
  }
  if (viewerRole !== "ADMIN" && submission.userId !== viewerUserId) {
    throw new AppError("FORBIDDEN", "閲覧権限がありません。", 403);
  }

  // Test / Course / Question / Choice を CmsPort から取得
  const cmsTest = await cms.getTest(submission.testId);
  if (!cmsTest) {
    throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);
  }
  const cmsCourse = await cms.getCourse(cmsTest.courseId);
  const cmsQuestions = await cms.listQuestions(submission.testId);
  const allChoices = await cms.listChoices();

  // questionId → choices のマップ
  const choicesByQuestion = new Map<string, { id: string; text: string; isCorrect: boolean; order: number }[]>();
  for (const c of allChoices) {
    if (!choicesByQuestion.has(c.questionId)) choicesByQuestion.set(c.questionId, []);
    choicesByQuestion.get(c.questionId)!.push({ id: c.id, text: c.text, isCorrect: c.isCorrect, order: c.order });
  }

  const questions: SubmissionResultQuestion[] = cmsQuestions
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      const choices = (choicesByQuestion.get(q.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          id:      c.id,
          label:   c.text,
          correct: c.isCorrect,
          order:   c.order,
        }));
      return {
        id:          q.id,
        prompt:      q.text,
        explanation: "", // TSV fixture には explanation がないため空文字
        type:        q.type,
        order:       q.order,
        choices,
      };
    });

  const testResult: SubmissionResultTest = {
    id:           cmsTest.id,
    title:        cmsTest.title,
    passingScore: cmsTest.passingScore ?? 70,
    maxAttempts:  cmsTest.maxAttempts ?? 3,
    courseId:     cmsTest.courseId,
    courseTitle:  cmsCourse?.title ?? "",
    questions,
  };

  // 残り受験可能回数を計算
  const finishedAttempts = await prisma.submission.count({
    where: {
      userId: submission.userId,
      testId: submission.testId,
      status: { in: ["PASSED", "FAILED", "SUBMITTED"] },
    },
  });
  const remainingAttempts = Math.max(
    0,
    testResult.maxAttempts - finishedAttempts,
  );

  return {
    submission: {
      ...submission,
      test: testResult,
    },
    remainingAttempts,
  };
}

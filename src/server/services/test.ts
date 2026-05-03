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

  // maxAttempts などの追加フィールドは Prisma から取得 (CmsPort には prerequisiteCourseId がない)
  const dbTest = await prisma.test.findUnique({
    where: { id: testId },
    select: {
      id: true,
      courseId: true,
      maxAttempts: true,
      prerequisiteCourseId: true,
    },
  });
  // getTest で存在確認済みなので null チェックは念のため
  if (!dbTest) {
    throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);
  }

  // 受講者がこの Course に Enrollment を持っているか
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: dbTest.courseId } },
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
  const cmsLessons = await cms.listLessons(dbTest.courseId);
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

  // prerequisite Course (別コース指定がある場合) も CmsPort 経由で Lesson 一覧を取得
  if (dbTest.prerequisiteCourseId && dbTest.prerequisiteCourseId !== dbTest.courseId) {
    const preLessons = await cms.listLessons(dbTest.prerequisiteCourseId);
    if (preLessons.length > 0) {
      const preLessonIds = preLessons.map((l) => l.id);
      const preCompleted = await prisma.progress.count({
        where: {
          userId,
          lessonId: { in: preLessonIds },
          completed: true,
        },
      });
      if (preCompleted < preLessons.length) {
        throw new AppError(
          "PREREQUISITE_NOT_MET",
          "前提コースを修了してから受験してください。",
          422,
        );
      }
    }
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

  if (finishedAttempts >= dbTest.maxAttempts) {
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
 * 提出 + 自動採点。部分点なし: 問題ごとに「選んだ集合」と「correct=true 集合」が
 * 完全一致のみ正解。
 *
 * M-4: testId を受け取り、Submission の testId と一致することを検証する。
 * 不一致の場合は NOT_FOUND を返す (IDOR / ID 混同攻撃を防ぐ)。
 *
 * 採点で使う Question / Choice は Submission に紐付く SQL データを参照する。
 * (Submission/Answer/Choice は SQL に残す設計)
 */
export async function submitSubmission(
  submissionId: string,
  userId: string,
  answers: SubmitAnswer[],
  expectedTestId?: string,
): Promise<SubmitSubmissionResult> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      testId: true,
      userId: true,
      status: true,
      attemptNo: true,
      test: {
        select: {
          id: true,
          passingScore: true,
          questions: {
            select: {
              id: true,
              choices: {
                select: { id: true, correct: true },
              },
            },
          },
        },
      },
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

  const totalQuestions = submission.test.questions.length;
  if (totalQuestions === 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      "問題が登録されていません。",
      422,
    );
  }

  const answerByQuestionId = new Map<string, Set<string>>();
  for (const a of answers) {
    answerByQuestionId.set(a.questionId, new Set(a.choiceIds));
  }

  let correctCount = 0;
  const answerRows: Prisma.AnswerCreateManyInput[] = [];

  for (const q of submission.test.questions) {
    const correctSet = new Set(
      q.choices.filter((c) => c.correct).map((c) => c.id),
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
    const validChoiceIds = new Set(q.choices.map((c) => c.id));
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
    score >= submission.test.passingScore ? "PASSED" : "FAILED";

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

/**
 * 結果ページ表示用: Submission + Question + Choice + Answer を取得する。
 * アクセス権 (本人 or ADMIN) は呼び出し側で渡された role と userId で検証する。
 * Question / Choice は Submission に紐付く SQL データを参照する (Submission は SQL 残留)。
 */
export async function getSubmissionForResult(
  submissionId: string,
  viewerUserId: string,
  viewerRole: "STUDENT" | "ADMIN",
) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      test: {
        select: {
          id: true,
          title: true,
          passingScore: true,
          maxAttempts: true,
          courseId: true,
          course: { select: { id: true, title: true } },
          questions: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              prompt: true,
              explanation: true,
              type: true,
              order: true,
              choices: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  label: true,
                  correct: true,
                  order: true,
                },
              },
            },
          },
        },
      },
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
    submission.test.maxAttempts - finishedAttempts,
  );

  return { submission, remainingAttempts };
}

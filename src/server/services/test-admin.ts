import type { QuestionType } from "@prisma/client";
import { prisma } from "@/server/repositories/db";
import { container } from "@/server/container";
import { AppError } from "@/lib/errors";
import type { CmsPort } from "@/server/ports/cms";

// ---------- write 系ガード ----------

function assertWriteAllowed(): void {
  if (process.env.CMS_SOURCE === "spreadsheet") {
    throw new AppError(
      "WRITE_NOT_SUPPORTED",
      "Spreadsheet モードでは管理画面から教材を編集できません。Spreadsheet で直接編集してください。",
      422,
    );
  }
}

// ---------- Test write ----------

export type CreateTestInput = {
  courseId: string;
  title: string;
  description?: string;
  prerequisiteCourseId?: string | null;
  passingScore: number;
  maxAttempts: number;
  timeLimitSec?: number | null;
};

export async function createTest(
  actorId: string,
  input: CreateTestInput,
): Promise<{ testId: string }> {
  assertWriteAllowed();
  if (input.title.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "タイトルを入力してください。", 422);
  }
  if (input.passingScore < 0 || input.passingScore > 100) {
    throw new AppError("VALIDATION_FAILED", "合格点は 0-100 で指定してください。", 422);
  }
  if (input.maxAttempts < 1) {
    throw new AppError("VALIDATION_FAILED", "受験回数上限は 1 以上で指定してください。", 422);
  }
  // write 系は Prisma で Course 存在確認 (spreadsheet モードはガードで弾かれる)
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: { id: true },
  });
  if (!course) throw new AppError("NOT_FOUND", "コースが見つかりません。", 404);

  const test = await prisma.test.create({
    data: {
      courseId: input.courseId,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      prerequisiteCourseId: input.prerequisiteCourseId ?? null,
      passingScore: input.passingScore,
      maxAttempts: input.maxAttempts,
      timeLimitSec: input.timeLimitSec ?? null,
    },
    select: { id: true },
  });
  await container.audit.write({
    actorId,
    action: "TEST_CREATE",
    target: `Test:${test.id}`,
    diff: input,
  });
  return { testId: test.id };
}

export type UpdateTestInput = {
  id: string;
  title?: string;
  description?: string;
  prerequisiteCourseId?: string | null;
  passingScore?: number;
  maxAttempts?: number;
  timeLimitSec?: number | null;
};

export async function updateTest(
  actorId: string,
  input: UpdateTestInput,
): Promise<void> {
  assertWriteAllowed();
  const before = await prisma.test.findUnique({ where: { id: input.id } });
  if (!before) throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);

  if (input.passingScore !== undefined && (input.passingScore < 0 || input.passingScore > 100)) {
    throw new AppError("VALIDATION_FAILED", "合格点は 0-100 で指定してください。", 422);
  }

  await prisma.test.update({
    where: { id: input.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
      ...(input.prerequisiteCourseId !== undefined
        ? { prerequisiteCourseId: input.prerequisiteCourseId }
        : {}),
      ...(input.passingScore !== undefined ? { passingScore: input.passingScore } : {}),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      ...(input.timeLimitSec !== undefined
        ? { timeLimitSec: input.timeLimitSec }
        : {}),
    },
  });
  await container.audit.write({
    actorId,
    action: "TEST_UPDATE",
    target: `Test:${input.id}`,
    diff: { before, after: input },
  });
}

export async function publishTest(
  actorId: string,
  id: string,
  published: boolean,
): Promise<void> {
  assertWriteAllowed();
  // write 系は Prisma で Test 存在確認 (spreadsheet モードはガードで弾かれる)
  const before = await prisma.test.findUnique({
    where: { id },
    select: { id: true, published: true, questions: { select: { id: true } } },
  });
  if (!before) throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);
  if (published && before.questions.length === 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      "問題が登録されていないため公開できません。",
      422,
    );
  }
  await prisma.test.update({ where: { id }, data: { published } });
  await container.audit.write({
    actorId,
    action: "TEST_PUBLISH",
    target: `Test:${id}`,
    diff: { from: before.published, to: published },
  });
}

// ---------- Question write ----------

export type ChoiceInput = {
  label: string;
  correct: boolean;
};

export type AddQuestionInput = {
  testId: string;
  type: QuestionType;
  prompt: string;
  explanation: string;
  choices: ChoiceInput[];
};

function validateQuestionShape(
  type: QuestionType,
  choices: ChoiceInput[],
): void {
  if (choices.length < 2) {
    throw new AppError(
      "VALIDATION_FAILED",
      "選択肢は 2 つ以上必要です。",
      422,
    );
  }
  const correctCount = choices.filter((c) => c.correct).length;
  if (correctCount === 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      "正解の選択肢を 1 つ以上指定してください。",
      422,
    );
  }
  if (type === "SINGLE" && correctCount !== 1) {
    throw new AppError(
      "VALIDATION_FAILED",
      "SINGLE 問題は正解を 1 つだけ指定してください。",
      422,
    );
  }
  for (const c of choices) {
    if (c.label.trim().length === 0) {
      throw new AppError(
        "VALIDATION_FAILED",
        "空の選択肢があります。",
        422,
      );
    }
  }
}

export async function addQuestion(
  actorId: string,
  input: AddQuestionInput,
): Promise<{ questionId: string }> {
  assertWriteAllowed();
  if (input.prompt.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "設問文を入力してください。", 422);
  }
  validateQuestionShape(input.type, input.choices);

  // write 系は Prisma で Test 存在確認 (spreadsheet モードはガードで弾かれる)
  const test = await prisma.test.findUnique({
    where: { id: input.testId },
    select: { id: true, _count: { select: { questions: true } } },
  });
  if (!test) throw new AppError("NOT_FOUND", "テストが見つかりません。", 404);

  const existingCount = test._count.questions;

  const question = await prisma.question.create({
    data: {
      testId: input.testId,
      type: input.type,
      prompt: input.prompt.trim(),
      explanation: input.explanation.trim(),
      order: existingCount,
      choices: {
        create: input.choices.map((c, i) => ({
          label: c.label.trim(),
          correct: c.correct,
          order: i,
        })),
      },
    },
    select: { id: true },
  });
  await container.audit.write({
    actorId,
    action: "TEST_UPDATE",
    target: `Question:${question.id}`,
    diff: input,
  });
  return { questionId: question.id };
}

export type UpdateQuestionInput = {
  id: string;
  testId: string; // H-5: 呼び出し元が所属テストを明示的に指定する
  type: QuestionType;
  prompt: string;
  explanation: string;
  choices: ChoiceInput[];
};

export async function updateQuestion(
  actorId: string,
  input: UpdateQuestionInput,
): Promise<void> {
  assertWriteAllowed();
  if (input.prompt.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "設問文を入力してください。", 422);
  }
  validateQuestionShape(input.type, input.choices);

  const before = await prisma.question.findUnique({
    where: { id: input.id },
    include: { choices: true },
  });
  if (!before) throw new AppError("NOT_FOUND", "設問が見つかりません。", 404);

  // H-5: question が指定された testId に属することを検証
  if (before.testId !== input.testId) {
    throw new AppError(
      "NOT_FOUND",
      "設問が見つかりません。",
      404,
    );
  }

  // 選択肢は丸ごと差し替え (Answer は Question 単位の Cascade で消えるが、
  // 公開後の編集では原則新規問題として登録するべき。簡易実装。)
  await prisma.$transaction([
    prisma.choice.deleteMany({ where: { questionId: input.id } }),
    prisma.question.update({
      where: { id: input.id },
      data: {
        type: input.type,
        prompt: input.prompt.trim(),
        explanation: input.explanation.trim(),
        choices: {
          create: input.choices.map((c, i) => ({
            label: c.label.trim(),
            correct: c.correct,
            order: i,
          })),
        },
      },
    }),
  ]);
  await container.audit.write({
    actorId,
    action: "TEST_UPDATE",
    target: `Question:${input.id}`,
    diff: { before, after: input },
  });
}

export type DeleteQuestionInput = {
  id: string;
  testId: string; // H-5: 呼び出し元が所属テストを明示的に指定する
};

export async function deleteQuestion(
  actorId: string,
  input: DeleteQuestionInput,
): Promise<void> {
  assertWriteAllowed();
  const before = await prisma.question.findUnique({
    where: { id: input.id },
    select: { id: true, testId: true },
  });
  if (!before) throw new AppError("NOT_FOUND", "設問が見つかりません。", 404);

  // H-5: question が指定された testId に属することを検証
  if (before.testId !== input.testId) {
    throw new AppError(
      "NOT_FOUND",
      "設問が見つかりません。",
      404,
    );
  }

  await prisma.question.delete({ where: { id: input.id } });
  await container.audit.write({
    actorId,
    action: "TEST_UPDATE",
    target: `Question:${input.id}`,
    diff: { deleted: true, ...before },
  });
}

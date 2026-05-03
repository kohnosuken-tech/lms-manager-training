/**
 * test-admin.ts — Phase E 以降はすべての write 操作が不可。
 *
 * Test / Question / Choice は CmsPort (TSV fixture or Spreadsheet) が
 * 唯一のデータソースとなるため、管理画面からの書き込みはサポートしない。
 * 各関数は assertWriteAllowed() を呼び出して WRITE_NOT_SUPPORTED エラーを返す。
 */

import { AppError } from "@/lib/errors";

// ---------- write 系ガード ----------

function assertWriteAllowed(): never {
  throw new AppError(
    "WRITE_NOT_SUPPORTED",
    "テスト/設問の編集は管理画面から行えません。TSV fixture または Spreadsheet で直接編集してください。",
    422,
  );
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
  _actorId: string,
  _input: CreateTestInput,
): Promise<{ testId: string }> {
  assertWriteAllowed();
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
  _actorId: string,
  _input: UpdateTestInput,
): Promise<void> {
  assertWriteAllowed();
}

export async function publishTest(
  _actorId: string,
  _id: string,
  _published: boolean,
): Promise<void> {
  assertWriteAllowed();
}

// ---------- Question write ----------

export type ChoiceInput = {
  label: string;
  correct: boolean;
};

export type AddQuestionInput = {
  testId: string;
  type: "SINGLE" | "MULTIPLE";
  prompt: string;
  explanation: string;
  choices: ChoiceInput[];
};

export async function addQuestion(
  _actorId: string,
  _input: AddQuestionInput,
): Promise<{ questionId: string }> {
  assertWriteAllowed();
}

export type UpdateQuestionInput = {
  id: string;
  testId: string;
  type: "SINGLE" | "MULTIPLE";
  prompt: string;
  explanation: string;
  choices: ChoiceInput[];
};

export async function updateQuestion(
  _actorId: string,
  _input: UpdateQuestionInput,
): Promise<void> {
  assertWriteAllowed();
}

export type DeleteQuestionInput = {
  id: string;
  testId: string;
};

export async function deleteQuestion(
  _actorId: string,
  _input: DeleteQuestionInput,
): Promise<void> {
  assertWriteAllowed();
}

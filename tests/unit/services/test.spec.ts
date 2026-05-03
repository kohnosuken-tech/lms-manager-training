/**
 * submitSubmission の自動採点ロジックのユニットテスト
 *
 * SINGLE 選択 / MULTIPLE 選択 / 部分点なし / タイムリミット超過 (status 判定) を検証する。
 *
 * Phase E: Test / Question / Choice は Prisma から削除済み。
 * CmsPort モックを注入して採点ロジックを検証する。
 * Prisma は Submission / Answer / User / Enrollment / Progress のみを操作する。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "../../helpers/db";
import { submitSubmission } from "@/server/services/test";
import type { CmsPort, Test, Question, Choice } from "@/server/ports/cms";

// container の audit/logger を noop にしてサイドエフェクトを排除
vi.mock("@/server/container", () => ({
  container: {
    audit:  { write: vi.fn().mockResolvedValue(undefined) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cms:    null, // テストでは明示的に cms を渡す
  },
}));

// ---------- CmsPort モックファクトリ ----------

const now = new Date().toISOString();

function makeMockCms(opts: {
  tests?:     Test[];
  questions?: Question[];
  choices?:   Choice[];
}): CmsPort {
  const tests     = opts.tests     ?? [];
  const questions = opts.questions ?? [];
  const choices   = opts.choices   ?? [];
  return {
    listCourses:   vi.fn().mockResolvedValue([]),
    listLessons:   vi.fn().mockResolvedValue([]),
    listTests:     vi.fn().mockResolvedValue(tests),
    listQuestions: vi.fn().mockImplementation((testId?: string) =>
      Promise.resolve(testId ? questions.filter((q) => q.testId === testId) : questions),
    ),
    listChoices:   vi.fn().mockResolvedValue(choices),
    getCourse:     vi.fn().mockResolvedValue(null),
    getLesson:     vi.fn().mockResolvedValue(null),
    getTest:       vi.fn().mockImplementation((id: string) =>
      Promise.resolve(tests.find((t) => t.id === id) ?? null),
    ),
    getQuestion:   vi.fn().mockImplementation((id: string) =>
      Promise.resolve(questions.find((q) => q.id === id) ?? null),
    ),
  };
}

// ---------- フィクスチャ定数 ----------

const COURSE_ID = "test-course-id";
const TEST_ID   = "test-test-id";

// Question / Choice の固定 ID
const SINGLE_Q_ID        = "q-single";
const SINGLE_CORRECT_CID = "c-single-correct";
const SINGLE_WRONG_CID   = "c-single-wrong";

const MULTI_Q_ID          = "q-multi";
const MULTI_CORRECT_CID_A = "c-multi-correct-a";
const MULTI_CORRECT_CID_B = "c-multi-correct-b";
const MULTI_WRONG_CID     = "c-multi-wrong";

const CMS_TEST: Test = {
  id:           TEST_ID,
  courseId:     COURSE_ID,
  title:        "確認テスト",
  passingScore: 70,
  maxAttempts:  3,
  published:    true,
  createdAt:    now,
  updatedAt:    now,
};

const CMS_QUESTIONS: Question[] = [
  {
    id: SINGLE_Q_ID, testId: TEST_ID, order: 0, type: "SINGLE",
    text: "問 1", createdAt: now, updatedAt: now,
  },
  {
    id: MULTI_Q_ID, testId: TEST_ID, order: 1, type: "MULTIPLE",
    text: "問 2", createdAt: now, updatedAt: now,
  },
];

const CMS_CHOICES: Choice[] = [
  { id: SINGLE_CORRECT_CID, questionId: SINGLE_Q_ID, order: 0, text: "正解",   isCorrect: true,  createdAt: now, updatedAt: now },
  { id: SINGLE_WRONG_CID,   questionId: SINGLE_Q_ID, order: 1, text: "不正解", isCorrect: false, createdAt: now, updatedAt: now },
  { id: MULTI_CORRECT_CID_A, questionId: MULTI_Q_ID, order: 0, text: "正解A",  isCorrect: true,  createdAt: now, updatedAt: now },
  { id: MULTI_CORRECT_CID_B, questionId: MULTI_Q_ID, order: 1, text: "正解B",  isCorrect: true,  createdAt: now, updatedAt: now },
  { id: MULTI_WRONG_CID,     questionId: MULTI_Q_ID, order: 2, text: "不正解C",isCorrect: false, createdAt: now, updatedAt: now },
];

// ---------- Prisma フィクスチャ (User + Submission のみ) ----------

async function buildFixtures(): Promise<{ userId: string; submissionId: string }> {
  const user = await testPrisma.user.create({
    data: { email: "testuser@example.com", name: "テストユーザー", role: "STUDENT" },
    select: { id: true },
  });

  const submission = await testPrisma.submission.create({
    data: {
      testId:    TEST_ID,
      userId:    user.id,
      status:    "IN_PROGRESS",
      attemptNo: 1,
    },
    select: { id: true },
  });

  return { userId: user.id, submissionId: submission.id };
}

// ---------- テスト ----------

describe("submitSubmission", () => {
  let userId:       string;
  let submissionId: string;
  let cms:          CmsPort;

  beforeEach(async () => {
    await resetDb();
    const fx = await buildFixtures();
    userId       = fx.userId;
    submissionId = fx.submissionId;
    cms = makeMockCms({ tests: [CMS_TEST], questions: CMS_QUESTIONS, choices: CMS_CHOICES });
  });

  it("SINGLE 問題に正解すると score=100 かつ PASSED になる (passingScore=70)", async () => {
    const result = await submitSubmission(submissionId, userId, [
      { questionId: SINGLE_Q_ID, choiceIds: [SINGLE_CORRECT_CID] },
      { questionId: MULTI_Q_ID,  choiceIds: [MULTI_CORRECT_CID_A, MULTI_CORRECT_CID_B] },
    ], undefined, cms);

    expect(result.score).toBe(100);
    expect(result.status).toBe("PASSED");
  });

  it("SINGLE 問題に不正解すると score=50 (2問中1問正解) かつ FAILED になる", async () => {
    const result = await submitSubmission(submissionId, userId, [
      { questionId: SINGLE_Q_ID, choiceIds: [SINGLE_WRONG_CID] },
      { questionId: MULTI_Q_ID,  choiceIds: [MULTI_CORRECT_CID_A, MULTI_CORRECT_CID_B] },
    ], undefined, cms);

    expect(result.score).toBe(50);
    expect(result.status).toBe("FAILED");
  });

  it("MULTIPLE 問題は部分点なし: 正解の一部のみ選択すると不正解になる", async () => {
    // multiQ の正解は 2 つ。1 つだけ選ぶと不正解
    const result = await submitSubmission(submissionId, userId, [
      { questionId: SINGLE_Q_ID, choiceIds: [SINGLE_CORRECT_CID] },
      { questionId: MULTI_Q_ID,  choiceIds: [MULTI_CORRECT_CID_A] },
    ], undefined, cms);

    expect(result.score).toBe(50);
    expect(result.status).toBe("FAILED");
  });

  it("MULTIPLE 問題で正解に余分な選択肢を加えると不正解になる (部分点なし)", async () => {
    const result = await submitSubmission(submissionId, userId, [
      { questionId: SINGLE_Q_ID, choiceIds: [SINGLE_CORRECT_CID] },
      { questionId: MULTI_Q_ID,  choiceIds: [MULTI_CORRECT_CID_A, MULTI_CORRECT_CID_B, MULTI_WRONG_CID] },
    ], undefined, cms);

    expect(result.score).toBe(50);
    expect(result.status).toBe("FAILED");
  });

  it("全問不正解 (回答なし) で score=0 かつ FAILED になる", async () => {
    const result = await submitSubmission(submissionId, userId, [], undefined, cms);

    expect(result.score).toBe(0);
    expect(result.status).toBe("FAILED");
  });

  it("既に確定済みの Submission を再送信しようとすると CONFLICT エラーが発生する", async () => {
    // 一度確定させる
    await submitSubmission(submissionId, userId, [], undefined, cms);

    // 同じ submissionId で再度送信を試みる
    await expect(
      submitSubmission(submissionId, userId, [], undefined, cms),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("他人の Submission を送信しようとすると FORBIDDEN エラーが発生する", async () => {
    const otherUser = await testPrisma.user.create({
      data: { email: "other@example.com", name: "他のユーザー", role: "STUDENT" },
      select: { id: true },
    });

    await expect(
      submitSubmission(submissionId, otherUser.id, [], undefined, cms),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("expectedTestId が Submission の testId と一致する場合は正常に採点される", async () => {
    const result = await submitSubmission(
      submissionId,
      userId,
      [],
      TEST_ID, // 正しい testId
      cms,
    );
    expect(result.score).toBe(0);
    expect(result.status).toBe("FAILED");
  });

  it("expectedTestId が Submission の testId と不一致の場合は NOT_FOUND エラーが発生する (M-4)", async () => {
    const wrongTestId = "wrong-test-id-that-does-not-match";

    await expect(
      submitSubmission(submissionId, userId, [], wrongTestId, cms),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("expectedTestId を省略した場合は検証をスキップして正常採点される", async () => {
    const result = await submitSubmission(
      submissionId,
      userId,
      [
        { questionId: SINGLE_Q_ID, choiceIds: [SINGLE_CORRECT_CID] },
        { questionId: MULTI_Q_ID,  choiceIds: [MULTI_CORRECT_CID_A, MULTI_CORRECT_CID_B] },
      ],
      undefined, // 省略
      cms,
    );
    expect(result.score).toBe(100);
    expect(result.status).toBe("PASSED");
  });
});

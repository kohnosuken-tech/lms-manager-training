/**
 * SubmissionPort — テスト提出の CRUD インターフェース
 *
 * Notion adapter が実装する。Phase G2 で新設。
 */

export type SubmissionStatus = "IN_PROGRESS" | "PASSED" | "FAILED" | "ABANDONED";

export type Submission = {
  id: string;
  userId: string;
  testId: string;
  status: SubmissionStatus;
  score: number | null;
  attemptNo: number;
  startedAt: string; // ISO8601
  submittedAt: string | null;
};

export type CreateSubmissionInput = {
  id: string;
  userId: string;
  testId: string;
  status: SubmissionStatus;
  attemptNo: number;
};

export type UpdateSubmissionInput = {
  status?: SubmissionStatus;
  score?: number | null;
  submittedAt?: string | null;
};

export interface SubmissionPort {
  /** id で検索 */
  findById(id: string): Promise<Submission | null>;
  /** userId + testId + status で検索 */
  findByUserAndTest(
    userId: string,
    testId: string,
    status?: SubmissionStatus,
  ): Promise<Submission[]>;
  /** userId + testId で最新 IN_PROGRESS を検索 */
  findInProgress(userId: string, testId: string): Promise<Submission | null>;
  /** 完了済み (PASSED | FAILED) の件数 */
  countFinished(userId: string, testId: string): Promise<number>;
  /** 合格済みかどうか */
  hasPassed(userId: string, testId: string): Promise<boolean>;
  /** 提出作成 */
  create(input: CreateSubmissionInput): Promise<Submission>;
  /** 提出更新 (採点結果を書き込む) */
  update(id: string, input: UpdateSubmissionInput): Promise<Submission>;
}

/**
 * AnswerPort — 回答の CRUD インターフェース
 *
 * Notion adapter が実装する。Phase G2 で新設。
 * 設計: 1 row = 1 choice (複数選択は別レコード)
 */

export type Answer = {
  id: string;
  submissionId: string;
  questionId: string;
  choiceId: string;
  createdAt: string; // ISO8601
};

export type CreateAnswerInput = {
  id: string;
  submissionId: string;
  questionId: string;
  choiceId: string;
};

export interface AnswerPort {
  /** submissionId で全回答を取得 */
  findBySubmission(submissionId: string): Promise<Answer[]>;
  /** 回答を一括作成 */
  createMany(inputs: CreateAnswerInput[]): Promise<Answer[]>;
  /** submissionId で全回答を削除 */
  deleteBySubmission(submissionId: string): Promise<void>;
}

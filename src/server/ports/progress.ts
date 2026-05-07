/**
 * ProgressPort — 視聴進捗の CRUD インターフェース
 *
 * Notion adapter が実装する (write は write-queue 経由)。Phase G2 で新設。
 */

export type Progress = {
  id: string;
  userId: string;
  lessonId: string;
  watchedSec: number;
  lastPositionSec: number;
  completed: boolean;
  completedAt: string | null; // ISO8601
  updatedAt: string;
};

export type UpsertProgressInput = {
  userId: string;
  lessonId: string;
  watchedSec: number;
  lastPositionSec: number;
  completed: boolean;
  completedAt?: string | null;
};

export interface ProgressPort {
  /** userId + lessonId で検索 */
  findByUserAndLesson(userId: string, lessonId: string): Promise<Progress | null>;
  /** userId で全進捗を取得 */
  findByUser(userId: string): Promise<Progress[]>;
  /** lessonIds に含まれる進捗を取得 */
  findByUserAndLessons(userId: string, lessonIds: string[]): Promise<Progress[]>;
  /**
   * upsert — 存在すれば更新、なければ作成。
   * write queue 経由での flush でも使用するため、adapter 内で queue に積む実装でよい。
   */
  upsert(input: UpsertProgressInput): Promise<Progress>;
  /**
   * バッファされた progress を即時 Notion に書き込む (write queue を flush)。
   * テスト / graceful shutdown で使用。Notion adapter 以外は no-op。
   */
  flushNow(): Promise<void>;
}

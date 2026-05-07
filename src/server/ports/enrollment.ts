/**
 * EnrollmentPort — コース受講登録の CRUD インターフェース
 *
 * Notion adapter が実装する。Phase G2 で新設。
 */

export type Enrollment = {
  id: string;
  userId: string;
  courseId: string;
  assignedAt: string; // ISO8601
  dueAt: string | null;
  completedAt: string | null;
};

export type CreateEnrollmentInput = {
  id: string;
  userId: string;
  courseId: string;
  dueAt?: string | null;
};

export type UpdateEnrollmentInput = {
  dueAt?: string | null;
  completedAt?: string | null;
};

export interface EnrollmentPort {
  /** userId + courseId で検索 (一意) */
  findByUserAndCourse(userId: string, courseId: string): Promise<Enrollment | null>;
  /** userId で全 Enrollment を取得 */
  findByUser(userId: string): Promise<Enrollment[]>;
  /** courseId で全 Enrollment を取得 */
  findByCourse(courseId: string): Promise<Enrollment[]>;
  /** 全 Enrollment を取得 */
  findAll(): Promise<Enrollment[]>;
  /** 受講登録作成 */
  create(input: CreateEnrollmentInput): Promise<Enrollment>;
  /** 受講登録更新 */
  update(id: string, input: UpdateEnrollmentInput): Promise<Enrollment>;
  /** 受講登録削除 */
  delete(id: string): Promise<void>;
}

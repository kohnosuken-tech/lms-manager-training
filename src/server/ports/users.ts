/**
 * UserPort — User エンティティの CRUD インターフェース
 *
 * Notion adapter が実装する。stub adapter は既存 Prisma ベースのまま。
 * Phase G2 で新設。
 */

export type UserRole = "STUDENT" | "ADMIN";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string | null;
  clerkUserId: string | null;
  sessionVersion: number;
  deactivated: boolean;
  createdAt: string; // ISO8601
  updatedAt: string;
};

export type CreateUserInput = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash?: string | null;
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  role?: UserRole;
  passwordHash?: string | null;
  clerkUserId?: string | null;
  sessionVersion?: number;
  deactivated?: boolean;
};

export type ListUsersFilter = {
  q?: string;
  role?: UserRole;
  deactivated?: boolean;
};

export interface UserPort {
  /** email でユーザーを検索 (認証で使用) */
  findByEmail(email: string): Promise<User | null>;
  /** id でユーザーを検索 */
  findById(id: string): Promise<User | null>;
  /** ユーザー一覧 (フィルタ付き) */
  list(filter?: ListUsersFilter): Promise<User[]>;
  /** ユーザー作成 (email 重複チェックは service 層で実施) */
  create(input: CreateUserInput): Promise<User>;
  /** ユーザー更新 */
  update(id: string, input: UpdateUserInput): Promise<User>;
}

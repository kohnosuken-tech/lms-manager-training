/**
 * AuditPort — 監査ログの書込インターフェース
 *
 * action は string として扱う (Prisma enum への依存を除去)。
 * Notion adapter では hash chain を維持する。
 */

export type AuditWriteInput = {
  actorId?: string | null;
  action: string;
  target?: string | null;
  diff?: unknown;
};

export interface AuditPort {
  write(input: AuditWriteInput): Promise<void>;
}

-- AlterTable
-- L-5: AuditLog に hash chain 用カラムを追加する
-- prevHash: 直前レコードの hash (最初のレコードは NULL)
-- hash: このレコード自体の SHA-256 hex (既存レコードは backfill スクリプトで埋める)
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT NOT NULL DEFAULT '';

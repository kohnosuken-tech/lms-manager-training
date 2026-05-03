-- AlterTable
-- H-2: JWT revoke 機構用の sessionVersion カラムを User テーブルに追加する
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;

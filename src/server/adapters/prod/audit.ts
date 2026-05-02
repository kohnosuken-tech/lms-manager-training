/**
 * prod audit adapter
 *
 * stub 実装 (Prisma で AuditLog テーブルに書き込む) は prod でも同じ挙動のため、
 * stub をそのまま re-export する。
 *
 * 将来 OpenTelemetry / CloudWatch Logs への転送などが必要になった場合は
 * このファイルに実装を追加する。
 */
export { stubAudit as prodAudit } from "@/server/adapters/stub/audit";

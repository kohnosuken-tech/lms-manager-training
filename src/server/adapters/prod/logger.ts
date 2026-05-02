/**
 * prod logger adapter
 *
 * stub 実装 (console.info/warn/error ラッパ) は prod でも同じ挙動のため、
 * stub をそのまま re-export する。
 *
 * 将来 Vercel Log Drains や Datadog への転送が必要になった場合は
 * このファイルに実装を追加する。
 */
export { stubLogger as prodLogger } from "@/server/adapters/stub/logger";

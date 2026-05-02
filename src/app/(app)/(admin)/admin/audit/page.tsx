import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/server/auth";
import { listAuditLogs } from "@/server/services/audit";
import type { AuditAction } from "@prisma/client";
import { AuditActionFilter } from "./audit-action-filter";

export const metadata = { title: "監査ログ | LMS" };

// アクション名を日本語ラベルに変換
const ACTION_LABEL: Record<AuditAction, string> = {
  USER_LOGIN: "ログイン",
  USER_CREATE: "ユーザー作成",
  USER_UPDATE: "ユーザー更新",
  USER_DEACTIVATE: "ユーザー無効化",
  ROLE_CHANGE: "ロール変更",
  COURSE_CREATE: "コース作成",
  COURSE_UPDATE: "コース更新",
  COURSE_PUBLISH: "コース公開",
  LESSON_CREATE: "レッスン作成",
  LESSON_UPDATE: "レッスン更新",
  LESSON_DELETE: "レッスン削除",
  ENROLLMENT_CREATE: "受講登録",
  ENROLLMENT_DELETE: "受講削除",
  TEST_CREATE: "テスト作成",
  TEST_UPDATE: "テスト更新",
  TEST_PUBLISH: "テスト公開",
  SUBMISSION_GRADE: "採点",
  EXPORT_CSV: "CSV エクスポート",
};

const DESTRUCTIVE_ACTIONS: AuditAction[] = [
  "USER_DEACTIVATE",
  "ROLE_CHANGE",
  "ENROLLMENT_DELETE",
  "LESSON_DELETE",
];
const OUTLINE_ACTIONS: AuditAction[] = ["EXPORT_CSV", "SUBMISSION_GRADE"];
const DEFAULT_ACTIONS: AuditAction[] = [
  "USER_LOGIN",
  "USER_CREATE",
  "USER_UPDATE",
];

// アクションカテゴリ別の Badge バリアント
function actionVariant(
  action: AuditAction,
): "default" | "secondary" | "destructive" | "outline" {
  if (DESTRUCTIVE_ACTIONS.includes(action)) return "destructive";
  if (OUTLINE_ACTIONS.includes(action)) return "outline";
  if (DEFAULT_ACTIONS.includes(action)) return "default";
  return "secondary";
}

// diff を 80 文字で切り詰める
function truncateDiff(diff: string): string {
  if (diff.length <= 80) return diff;
  return diff.slice(0, 77) + "...";
}

function formatAt(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

// searchParams の型 (Next.js 16 App Router)
type SearchParams = Promise<{ cursor?: string; action?: string }>;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const params = await searchParams;
  const cursor = params.cursor;
  const actionParam = params.action as AuditAction | undefined;

  const { items, nextCursor } = await listAuditLogs({
    cursor,
    action: actionParam,
    limit: 50,
  });

  // 次ページ URL の構築
  function buildNextUrl(): string {
    const p = new URLSearchParams();
    if (actionParam) p.set("action", actionParam);
    if (nextCursor) p.set("cursor", nextCursor);
    return `/admin/audit?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">監査ログ</h1>
        <p className="text-sm text-muted-foreground">
          管理操作の履歴を時系列で確認できます。
        </p>
      </div>

      {/* AuditAction フィルタ (URL state 同期のため use client) */}
      <AuditActionFilter currentAction={actionParam} />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">発生時刻</TableHead>
              <TableHead>アクター</TableHead>
              <TableHead>アクション</TableHead>
              <TableHead>ターゲット</TableHead>
              <TableHead>変更内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  ログがありません。
                </TableCell>
              </TableRow>
            ) : (
              items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatAt(log.at)}
                  </TableCell>
                  <TableCell>
                    {log.actor ? (
                      <div>
                        <p className="text-sm font-medium leading-tight">
                          {log.actor.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.actor.email}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionVariant(log.action)}>
                      {ACTION_LABEL[log.action]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">
                    {log.target ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 text-xs">
                    {log.diff && log.diff !== "{}" && log.diff !== "null" ? (
                      <details>
                        <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                          {truncateDiff(log.diff)}
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                          {log.diff}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ページネーション */}
      <div className="flex justify-end">
        <Button asChild variant="outline" disabled={!nextCursor}>
          <Link
            href={buildNextUrl()}
            aria-disabled={!nextCursor}
            tabIndex={nextCursor ? undefined : -1}
          >
            次のページへ
          </Link>
        </Button>
      </div>
    </div>
  );
}

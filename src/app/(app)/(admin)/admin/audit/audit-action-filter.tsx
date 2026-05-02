"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Prisma enum AuditAction の全値をクライアント側で列挙する。
// サーバで import した enum 値はシリアライズできないため、ここで直接定義する。
const AUDIT_ACTIONS = [
  "USER_LOGIN",
  "USER_CREATE",
  "USER_UPDATE",
  "USER_DEACTIVATE",
  "ROLE_CHANGE",
  "COURSE_CREATE",
  "COURSE_UPDATE",
  "COURSE_PUBLISH",
  "LESSON_CREATE",
  "LESSON_UPDATE",
  "LESSON_DELETE",
  "ENROLLMENT_CREATE",
  "ENROLLMENT_DELETE",
  "TEST_CREATE",
  "TEST_UPDATE",
  "TEST_PUBLISH",
  "SUBMISSION_GRADE",
  "EXPORT_CSV",
] as const;

type AuditAction = (typeof AUDIT_ACTIONS)[number];

const ACTION_LABELS: Record<AuditAction, string> = {
  USER_LOGIN: "ユーザーログイン",
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

const ALL_VALUE = "__ALL__";

export function AuditActionFilter({ currentAction }: { currentAction?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    // action が変わったらカーソルをリセットする
    params.delete("cursor");
    if (value === ALL_VALUE) {
      params.delete("action");
    } else {
      params.set("action", value);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="audit-action-filter"
        className="text-sm font-medium text-foreground"
      >
        アクション絞り込み
      </label>
      <Select
        value={currentAction ?? ALL_VALUE}
        onValueChange={handleChange}
      >
        <SelectTrigger id="audit-action-filter" className="w-52">
          <SelectValue placeholder="すべて" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>すべて</SelectItem>
          {AUDIT_ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {ACTION_LABELS[action]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

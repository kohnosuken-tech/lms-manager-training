"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { RequiredLabel } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  bulkCreateUsersAction,
  type BulkCreateUsersActionState,
} from "./actions";

const initial: BulkCreateUsersActionState = {};

const PLACEHOLDER = `email,name,role
yamada@example.com,山田 太郎,STUDENT
sato@example.com,佐藤 花子,ADMIN`;

export function BulkCreateUsersForm() {
  const [state, formAction, isPending] = useActionState(
    bulkCreateUsersAction,
    initial,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <h2 className="text-base font-medium">CSV 一括登録</h2>
      <p className="text-xs text-muted-foreground">
        ヘッダー行 <code>email,name,role</code> 必須。role は STUDENT / ADMIN。
      </p>
      <div className="space-y-1">
        <RequiredLabel htmlFor="csv">CSV テキスト</RequiredLabel>
        <Textarea
          id="csv"
          name="csv"
          rows={6}
          placeholder={PLACEHOLDER}
          required
          aria-required="true"
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.result ? (
        <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-2">
          <p>
            <strong>{state.result.created}</strong> 件作成しました。
            {state.result.errors.length > 0
              ? ` (${state.result.errors.length} 件スキップ)`
              : ""}
          </p>
          {state.result.errors.length > 0 ? (
            <ul className="list-disc pl-4 space-y-1 text-destructive">
              {state.result.errors.map((er) => (
                <li key={`${er.line}-${er.reason}`}>
                  行 {er.line}: {er.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "登録中..." : "一括登録"}
      </Button>
    </form>
  );
}
